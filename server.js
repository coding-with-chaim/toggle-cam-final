const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server);

app.get('/room/:roomId', (req, res) => {
    res.sendFile(`${__dirname}/public/room.html`);
});

io.on('connection', socket => {
    socket.on('user joined room', roomId => {
        const room = io.sockets.adapter.rooms.get(roomId);

        if (room && room.size === 4) {
            socket.emit('server is full');
            return;
        }

        const otherUsers = [];

        if (room) {
            room.forEach(id => {
                otherUsers.push(id);
            })
        }

        socket.join(roomId);
        socket.emit('all other users', otherUsers);
    });

    socket.on('peer connection request', ({ userIdToCall, sdp }) => {
        io.to(userIdToCall).emit("connection offer", { sdp, callerId: socket.id });
    });

    socket.on('connection answer', ({ userToAnswerTo, sdp }) => {
        io.to(userToAnswerTo).emit('connection answer', { sdp, answererId: socket.id })
    });

    socket.on('ice-candidate', ({ target, candidate }) => {
        io.to(target).emit('ice-candidate', { candidate, from: socket.id });
    });

    socket.on('disconnecting', () => {
        socket.rooms.forEach(room => {
            socket.to(room).emit('user disconnected', socket.id);
        });
    });

    socket.on('hide remote cam', targetId => {
        io.to(targetId).emit('hide cam');
    });

    socket.on('show remote cam', targetId => {
        io.to(targetId).emit('show cam')
    })

});

server.listen(1337, () => console.log('server is running on port 1337'));