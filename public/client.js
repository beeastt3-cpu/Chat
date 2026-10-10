const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

server.setMaxListeners(0);

app.use(express.static(path.join(__dirname, 'public')));

const users = {}; 
const bannedIPs = new Set();
const availableRooms = ["مصر", "شباب و بنات", "فرفشة", "كل العرب", "مساعدة و شكاوي"];

const arabicFirstNames = ["أحمد", "محمد", "محمود", "علي", "حسن", "حسين", "إبراهيم", "يوسف", "مصطفى", "خالد", "سعيد", "عمر", "عثمان", "حمزة", "بلال", "زياد", "طارق", "رامي", "كريم", "سامر"];
const arabicLastNames = ["المصري", "السعيد", "الشناوي", "المنشاوي", "الخطيب", "النجار", "الحداد", "التركي", "المغربي", "البدري", "الرفاعي", "صلاح", "جمال"];

for (let i = 1; i <= 30; i++) {
    const roomName = availableRooms[(i - 1) % availableRooms.length];
    const name = arabicFirstNames[i % arabicFirstNames.length] + "_" + arabicLastNames[i % arabicLastNames.length] + "_" + i;
    const botId = `bot_${i}`;
    
    users[botId] = {
        id: botId,
        username: name,
        room: roomName,
        isMaster: false,
        rank: "none",
        isBot: true,
        isMuted: false,
        ip: `192.168.1.${i}`
    };
}

io.on('connection', (socket) => {
    const clientIP = socket.handshake.address;

    if (bannedIPs.has(clientIP)) {
        socket.emit('banned', 'تم حظرك نهائياً من الشات.');
        socket.disconnect();
        return;
    }

    socket.on('joinRoom', ({ username, room }) => {
        let cleanName = String(username).trim().substring(0, 25) || 'زائر';
        const safeRoom = availableRooms.includes(room) ? room : 'مصر';

        if (socket.room) socket.leave(socket.room);

        let isMaster = cleanName.trim().toUpperCase() === 'SHURBAGY';

        socket.username = cleanName;
        socket.room = safeRoom;
        socket.isMaster = isMaster;
        socket.rank = isMaster ? 'shurbagy' : 'none';
        socket.isMuted = false;
        socket.clientIP = clientIP;

        users[socket.id] = {
            id: socket.id,
            username: cleanName,
            room: safeRoom,
            isMaster: isMaster,
            rank: socket.rank,
            isBot: false,
            isMuted: false,
            ip: clientIP
        };

        socket.join(safeRoom);

        if (isMaster) {
            socket.emit('message', {
                user: 'النظام',
                text: `أهلاً بك يا ${cleanName} في غرفة [${safeRoom}]! 🛡️ تم تفعيل صلاحيات مالك الشات والأدمن المطلقة.`,
                system: true
            });
        } else {
            socket.emit('message', {
                user: 'النظام',
                text: `أهلاً بك يا ${cleanName} في غرفة [${safeRoom}]! نتمنى لك وقتاً ممتعاً في الشات.`,
                system: true
            });
        }

        updateAllRoomsUsers();
    });

    socket.on('switchRoom', (newRoom) => {
        if (!availableRooms.includes(newRoom)) return;
        
        if (socket.room) {
            io.to(socket.room).emit('message', { user: 'النظام', text: `غادر ${socket.username} الغرفة.`, system: true });
            socket.leave(socket.room);
        }

        socket.room = newRoom;
        if (users[socket.id]) users[socket.id].room = newRoom;

        socket.join(newRoom);
        socket.emit('message', { user: 'النظام', text: `أهلاً بك في غرفة [${newRoom}].`, system: true });
        
        updateAllRoomsUsers();
    });

    // معالجة الأوامر واختصارات الشات المكتوبة بدقة تامة
    socket.on('chatMessage', (msg) => {
        if (!socket.room || !socket.username) return;
        const cleanMsg = String(msg).trim();
        if (!cleanMsg) return;

        const currentUser = users[socket.id];
        const isMasterUser = socket.isMaster || (currentUser && currentUser.isMaster);

        if (isMasterUser && cleanMsg.startsWith('/')) {
            const lowerMsg = cleanMsg.toLowerCase().replace(/\s+/g, ' '); // توحيد المسافات والأحرف الصغيرة
            const currentRoom = socket.room;

            // أمر إضافة البوتات (مثال: /addbots 50)
            if (lowerMsg.startsWith('/addbots')) {
                let count = 30;
                const parts = cleanMsg.split(' ');
                if (parts[1] && !isNaN(parts[1])) count = parseInt(parts[1]);

                const timestamp = Date.now();
                for (let j = 1; j <= count; j++) {
                    const randId = `dynamic_bot_${timestamp}_${j}`;
                    const randName = arabicFirstNames[Math.floor(Math.random() * arabicFirstNames.length)] + "_" + 
                                     arabicLastNames[Math.floor(Math.random() * arabicLastNames.length)] + "_" + Math.floor(Math.random() * 1000);
                    
                    users[randId] = {
                        id: randId,
                        username: randName,
                        room: currentRoom,
                        isMaster: false,
                        rank: "none",
                        isBot: true,
                        isMuted: false,
                        ip: `10.0.0.${Math.floor(Math.random() * 255)}`
                    };
                }

                io.to(currentRoom).emit('message', { user: 'النظام', text: `🤖 تم إضافة ${count} بوت جديد إلى غرفة [${currentRoom}] بنجاح!`, system: true });
                updateAllRoomsUsers();
                return;
            }

            // أمر طرد الجميع (يحذف الأعضاء والبوتات معاً)
            if (lowerMsg === '/kick all' || lowerMsg === '/kickall') {
                for (const id in users) {
                    if (users[id].room === currentRoom && id !== socket.id) {
                        if (!users[id].isBot) {
                            const s = io.sockets.sockets.get(id);
                            if (s) { s.emit('kicked', 'تم طردك بواسطة الأدمن.'); s.disconnect(); }
                        }
                        delete users[id];
                    }
                }
                io.to(currentRoom).emit('message', { user: 'النظام', text: '⚡ تم طرد جميع الأعضاء والبوتات وتفريغ الغرفة بالكامل.', system: true });
                updateAllRoomsUsers();
                return;
            }

            // أمر كتم الجميع: /mute all
            if (lowerMsg === '/mute all' || lowerMsg === '/muteall') {
                for (const id in users) {
                    if (users[id].room === currentRoom && id !== socket.id) {
                        users[id].isMuted = true;
                    }
                }
                io.to(currentRoom).emit('message', { user: 'النظام', text: '🔇 تم كتم جميع الأعضاء في الغرفة.', system: true });
                updateAllRoomsUsers();
                return;
            }
        }

        if (currentUser && currentUser.isMuted) {
            socket.emit('message', { user: 'النظام', text: '⚠️ أنت مكتوم حالياً.', system: true });
            return;
        }

        io.to(socket.room).emit('message', {
            user: socket.username,
            text: cleanMsg,
            userId: socket.id,
            isMaster: isMasterUser,
            rank: currentUser ? currentUser.rank : 'none'
        });
    });

    socket.on('triggerAddBots', () => {
        if (!socket.isMaster) return;
        const currentRoom = socket.room;
        const count = 50;
        const timestamp = Date.now();

        for (let j = 1; j <= count; j++) {
            const randId = `dynamic_bot_${timestamp}_${j}`;
            const randName = arabicFirstNames[Math.floor(Math.random() * arabicFirstNames.length)] + "_" + 
                             arabicLastNames[Math.floor(Math.random() * arabicLastNames.length)] + "_" + Math.floor(Math.random() * 1000);
            
            users[randId] = {
                id: randId,
                username: randName,
                room: currentRoom,
                isMaster: false,
                rank: "none",
                isBot: true,
                isMuted: false,
                ip: `10.0.0.${Math.floor(Math.random() * 255)}`
            };
        }

        io.to(currentRoom).emit('message', { user: 'النظام', text: `🤖 تم إضافة ${count} بوت جديد إلى غرفة [${currentRoom}] بنجاح!`, system: true });
        updateAllRoomsUsers();
    });

    socket.on('adminKick', (targetId) => {
        if (!socket.isMaster) return;
        if (users[targetId]) {
            const targetRoom = users[targetId].room;
            const targetName = users[targetId].username;
            delete users[targetId];

            const targetSocket = io.sockets.sockets.get(targetId);
            if (targetSocket) {
                targetSocket.emit('kicked', 'تم طردك بواسطة الإدارة.');
                targetSocket.disconnect();
            }

            io.to(targetRoom).emit('message', { user: 'النظام', text: `تم طرد ${targetName}.`, system: true });
            updateAllRoomsUsers();
        }
    });

    socket.on('adminKickAll', () => {
        if (!socket.isMaster) return;
        const room = socket.room;
        for (const id in users) {
            if (users[id].room === room && id !== socket.id) {
                if (!users[id].isBot) {
                    const s = io.sockets.sockets.get(id);
                    if (s) { s.emit('kicked', 'تم طرد الجميع.'); s.disconnect(); }
                }
                delete users[id];
            }
        }
        io.to(room).emit('message', { user: 'النظام', text: '⚡ تم طرد جميع الأعضاء والبوتات وتفريغ الغرفة بالكامل.', system: true });
        updateAllRoomsUsers();
    });

    socket.on('adminMuteAll', () => {
        if (!socket.isMaster) return;
        const room = socket.room;
        for (const id in users) {
            if (users[id].room === room && id !== socket.id) {
                users[id].isMuted = true;
            }
        }
        io.to(room).emit('message', { user: 'النظام', text: '🔇 تم كتم جميع الأعضاء في الغرفة.', system: true });
        updateAllRoomsUsers();
    });

    socket.on('adminBan', (targetId) => {
        if (!socket.isMaster) return;
        if (users[targetId]) {
            if (users[targetId].ip) bannedIPs.add(users[targetId].ip);
            const targetRoom = users[targetId].room;
            const targetName = users[targetId].username;
            delete users[targetId];

            const targetSocket = io.sockets.sockets.get(targetId);
            if (targetSocket) {
                targetSocket.emit('banned', 'تم حظرك نهائياً.');
                targetSocket.disconnect();
            }

            io.to(targetRoom).emit('message', { user: 'النظام', text: `تم حظر ${targetName} نهائياً.`, system: true });
            updateAllRoomsUsers();
        }
    });

    socket.on('adminMute', (targetId) => {
        if (!socket.isMaster) return;
        if (users[targetId]) {
            users[targetId].isMuted = !users[targetId].isMuted;
            updateAllRoomsUsers();
        }
    });

    socket.on('adminSetRank', ({ targetId, rank }) => {
        if (!socket.isMaster) return;
        if (users[targetId]) {
            users[targetId].rank = rank;
            updateAllRoomsUsers();
        }
    });

    socket.on('adminRename', ({ targetId, newName }) => {
        if (!socket.isMaster) return;
        if (users[targetId]) {
            users[targetId].username = String(newName).trim();
            updateAllRoomsUsers();
        }
    });

    socket.on('disconnect', () => {
        if (socket.room && socket.username) {
            delete users[socket.id];
            updateAllRoomsUsers();
        }
    });

    function updateAllRoomsUsers() {
        availableRooms.forEach(room => {
            let roomUsers = Object.values(users).filter(u => u.room === room);
            roomUsers.sort((a, b) => {
                if (a.isMaster) return -1;
                if (b.isMaster) return 1;
                return 0;
            });
            io.to(room).emit('roomUsers', roomUsers);
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Farfashangya Chat يعمل على: http://localhost:${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        server.listen(3001, () => {
            console.log(`✅ Farfashangya Chat يعمل على: http://localhost:3001`);
        });
    }
});