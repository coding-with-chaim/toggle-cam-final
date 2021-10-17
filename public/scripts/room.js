const peers = {};
const chatContainer = document.getElementById('left');
const remoteVideoContainer = document.getElementById('right');
const toggleButton = document.getElementById('toggle-cam');
const roomId = window.location.pathname.split('/')[2];
const userVideo = document.getElementById('user-video');
let userStream;
let isAdmin = false;
const socket = io('/');

function callOtherUsers(otherUsers, stream) {
    if (!otherUsers.length) {
        isAdmin = true;
    }
    otherUsers.forEach(userIdToCall => {
        const peer = createPeer(userIdToCall);
        peers[userIdToCall] = peer;
        stream.getTracks().forEach(track => {
            peer.addTrack(track, stream);
        });
    });
}

function createPeer(userIdToCall) {
    const peer = new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.stunprotocol.org"
            }
        ]
    });
    peer.onnegotiationneeded = () => userIdToCall ? handleNegotiationNeededEvent(peer, userIdToCall) : null;
    peer.onicecandidate = handleICECandidateEvent;
    peer.ontrack = (e) => {
        const container = document.createElement('div');
        container.classList.add('remote-video-container');
        const video = document.createElement('video');
        video.srcObject = e.streams[0];
        video.autoplay = true;
        video.playsInline = true;
        video.classList.add("remote-video");
        container.appendChild(video);
        if (isAdmin) {
            const button = document.createElement("button");
            button.innerHTML = `Hide user's cam`;
            button.classList.add('button');
            button.setAttribute('user-id', userIdToCall);
            container.appendChild(button);
        }
        container.id = userIdToCall;
        remoteVideoContainer.appendChild(container);
    }
    return peer;
}

async function handleNegotiationNeededEvent(peer, userIdToCall) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const payload = {
        sdp: peer.localDescription,
        userIdToCall,
    };

    socket.emit('peer connection request', payload);
}

async function handleReceiveOffer({ sdp, callerId }, stream) {
    const peer = createPeer(callerId);
    peers[callerId] = peer;
    const desc = new RTCSessionDescription(sdp);
    await peer.setRemoteDescription(desc);

    stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
    });

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    const payload = {
        userToAnswerTo: callerId,
        sdp: peer.localDescription,
    };

    socket.emit('connection answer', payload);
}

function handleAnswer({ sdp, answererId }) {
    const desc = new RTCSessionDescription(sdp);
    peers[answererId].setRemoteDescription(desc).catch(e => console.log(e));
}

function handleICECandidateEvent(e) {
    if (e.candidate) {
        Object.keys(peers).forEach(id => {
            const payload = {
                target: id,
                candidate: e.candidate,
            }
            socket.emit("ice-candidate", payload);
        });
    }
}

function handleReceiveIce({ candidate, from }) {
    const inComingCandidate = new RTCIceCandidate(candidate);
    peers[from].addIceCandidate(inComingCandidate);
};

function handleDisconnect(userId) {
    delete peers[userId];
    document.getElementById(userId).remove();
};

toggleButton.addEventListener('click', () => {
    const videoTrack = userStream.getTracks().find(track => track.kind === 'video');
    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        toggleButton.innerHTML = 'Show cam'
    } else {
        videoTrack.enabled = true;
        toggleButton.innerHTML = "Hide cam"
    }
});

remoteVideoContainer.addEventListener('click', (e) => {
    if (e.target.innerHTML.includes('Hide')) {
        e.target.innerHTML = 'show remote cam';
        socket.emit('hide remote cam', e.target.getAttribute('user-id'));
    } else {
        e.target.innerHTML = `Hide user's cam`;
        socket.emit('show remote cam', e.target.getAttribute('user-id'));
    }
})

function hideCam() {
    const videoTrack = userStream.getTracks().find(track => track.kind === 'video');
    videoTrack.enabled = false;
}

function showCam() {
    const videoTrack = userStream.getTracks().find(track => track.kind === 'video');
    videoTrack.enabled = true;
}

async function init() {
    socket.on('connect', async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        userStream = stream;
        userVideo.srcObject = stream;
        socket.emit('user joined room', roomId);

        socket.on('all other users', (otherUsers) => callOtherUsers(otherUsers, stream));

        socket.on("connection offer", (payload) => handleReceiveOffer(payload, stream));

        socket.on('connection answer', handleAnswer);

        socket.on('ice-candidate', handleReceiveIce);

        socket.on('user disconnected', (userId) => handleDisconnect(userId));

        socket.on('hide cam', hideCam);

        socket.on("show cam", showCam);

        socket.on('server is full', () => alert("chat is full"));
    });
}

init();