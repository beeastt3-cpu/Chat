const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

server.setMaxListeners(0);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const users = {}; 
const registeredUsers = {
    "SHURBAGY": { password: "3091997", email: "shurbagy@admin.com", verified: true }
};
const pendingVerification = {};
const availableRooms = ["مصر", "شباب و بنات", "فرفشة", "كل العرب", "مساعدة و شكاوي"];

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-app-password'
    }
});

app.post('/api/send-code', (req, res) => {
    const { username, email } = req.body;
    if (!username || !email) return res.json({ success: false, message: 'الرجاء إدخال الاسم والبريد الإلكتروني!' });

    const cleanName = username.trim().toUpperCase();
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    pendingVerification[cleanName] = { email, code: verificationCode };
    console.log(`🔑 [كود التحقق لـ ${cleanName}]: ${verificationCode}`);

    res.json({ success: true, message: 'تم إرسال كود التحقق بنجاح! (راجع التيرمينال للاختبار)' });
});

app.post('/api/verify-code', (req, res) => {
    const { username, email, code, password } = req.body;
    const cleanName = username.trim().toUpperCase();

    if (!pendingVerification[cleanName] || pendingVerification[cleanName].code !== code) {
        return res.json({ success: false, message: 'كود التحقق غير صحيح!' });
    }

    registeredUsers[cleanName] = {
        password: password || '123456',
        email: email,
        verified: true
    };

    delete pendingVerification[cleanName];
    res.json({ success: true, message: 'تم تسجيل الاسم وربطه بنجاح!' });
});

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ username, password, room }) => {
        let cleanName = String(username).trim().substring(0, 25) || 'زائر';
        let cleanPass = String(password || '').trim();
        const safeRoom = availableRooms.includes(room) ? room : 'مصر';

        let isMaster = cleanName.toUpperCase() === 'SHURBAGY';

        if (isMaster) {
            if (cleanPass !== "3091997") {
                socket.emit('loginError', '❌ الرقم السري خطأ يا شرباجي! الباسورد هو: 3091997');
                return;
            }
        } else {
            const upperName = cleanName.toUpperCase();
            if (registeredUsers[upperName]) {
                if (registeredUsers[upperName].password !== cleanPass) {
                    socket.emit('loginError', '❌ كلمة المرور غير صحيحة لهذا الاسم المسجل!');
                    return;
                }
            }
        }

        if (socket.room) socket.leave(socket.room);

        socket.username = cleanName;
        socket.room = safeRoom;
        socket.isMaster = isMaster;
        socket.rank = isMaster ? 'shurbagy' : 'none';
        socket.textColor = '#1e293b';

        users[socket.id] = {
            id: socket.id,
            username: cleanName,
            room: safeRoom,
            isMaster: isMaster,
            rank: socket.rank
        };

        socket.join(safeRoom);
        socket.emit('loginSuccess', { isMaster });

        if (isMaster) {
            socket.emit('message', { 
                user: 'النظام', 
                text: `أهلاً بك يا ${cleanName} في غرفة [${safeRoom}]! 🛡️ تم تفعيل صلاحيات الأدمن المطلقة والمالك.`, 
                system: true 
            });
        } else {
            socket.emit('message', { 
                user: 'النظام', 
                text: `أهلاً بيك في روم [${safeRoom}]! نتمنى لك وقتاً ممتعاً ومميزاً معنا.`, 
                system: true 
            });
        }

        updateAllRoomsUsers();
    });

    socket.on('switchRoom', (newRoom) => {
        if (!availableRooms.includes(newRoom)) return;
        if (socket.room) socket.leave(socket.room);
        
        socket.room = newRoom;
        if (users[socket.id]) users[socket.id].room = newRoom;
        socket.join(newRoom);
        
        socket.emit('message', { user: 'النظام', text: `أهلاً بك في روم [${newRoom}].`, system: true });
        updateAllRoomsUsers();
    });

    socket.on('changeTextColor', (color) => {
        socket.textColor = color || '#1e293b';
    });

    // أوامر وأدوات تحكم الأدمن (طرد عضو)
    socket.on('adminKickUser', (targetUserId) => {
        if (!socket.isMaster) return;
        const targetSocket = io.sockets.sockets.get(targetUserId);
        if (targetSocket) {
            targetSocket.emit('kicked', '⚡ تم طردك من قِبل مالك الشات (SHURBAGY).');
            targetSocket.disconnect();
            io.to(socket.room).emit('message', { user: 'النظام', text: `⚡ قام الأدمن بطرد أحد الأعضاء.`, system: true });
        }
    });

    socket.on('chatMessage', (msg) => {
        if (!socket.room || !socket.username) return;
        const cleanMsg = String(msg).trim();
        if (!cleanMsg) return;

        io.to(socket.room).emit('message', {
            user: socket.username,
            text: cleanMsg,
            isMaster: socket.isMaster,
            rank: socket.rank,
            textColor: socket.textColor
        });
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
            roomUsers.sort((a, b) => (a.isMaster ? -1 : b.isMaster ? 1 : 0));
            io.to(room).emit('roomUsers', roomUsers);
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ الشات يعمل بكفاءة تامة على: http://localhost:${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        server.listen(3001, () => {
            console.log(`✅ الشات يعمل على المنفذ البديل: http://localhost:3001`);
        });
    }
});