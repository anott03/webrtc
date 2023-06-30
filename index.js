const configuration = {
    iceServers: [
        {
            urls: [
                "stun:stun1.1.google.com:19302",
                "stun:stun2.1.google.com:19302",
            ],
        },
    ],
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;

function init() {}

async function createId() {
    roomId = 1;
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.addEventListener("track", (event) => {
        console.log("Got remote track:", event.streams[0]);
        event.streams[0].getTracks().forEach((track) => {
            console.log("Add a track to the remoteStream:", track);
            remoteStream.addTrack(track);
        });
    });
}

async function joinRoom() {
    roomId = document.querySelector("#room-id").value;
    console.log("Join room: ", roomId);
    document.querySelector(
        "#currentRoom"
    ).innerText = `Current room is ${roomId} - You are the callee!`;
    await joinRoomById(roomId);
}

async function joinRoomById(roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(`${roomId}`);
    const roomSnapshot = await roomRef.get();
    console.log("Got room:", roomSnapshot.exists);

    if (roomSnapshot.exists) {
        console.log(
            "Create PeerConnection with configuration: ",
            configuration
        );
        peerConnection = new RTCPeerConnection(configuration);
        registerPeerConnectionListeners();
        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.addEventListener("track", (event) => {
            console.log("Got remote track:", event.streams[0]);
            event.streams[0].getTracks().forEach((track) => {
                console.log("Add a track to the remoteStream:", track);
                remoteStream.addTrack(track);
            });
        });
    }
}

async function openUserMedia(e) {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
    });
    document.querySelector("#localVideo").srcObject = stream;
    localStream = stream;
    remoteStream = new MediaStream();
    document.querySelector("#remoteVideo").srcObject = remoteStream;

    console.log("Stream:", document.querySelector("#localVideo").srcObject);
    document.querySelector("#cameraBtn").disabled = true;
    document.querySelector("#joinBtn").disabled = false;
    document.querySelector("#createBtn").disabled = false;
    document.querySelector("#hangupBtn").disabled = false;
}

async function hangUp() {
    const tracks = document.querySelector("#localVideo").srcObject.getTracks();
    tracks.forEach((track) => {
        track.stop();
    });

    if (remoteStream) {
        remoteStream.getTracks().forEach((track) => track.stop());
    }

    if (peerConnection) {
        peerConnection.close();
    }

    document.location.reload(true);
}

function registerPeerConnectionListeners() {
    peerConnection.addEventListener("icegatheringstatechange", () => {
        console.log(
            `ICE gathering state changed: ${peerConnection.iceGatheringState}`
        );
    });

    peerConnection.addEventListener("connectionstatechange", () => {
        console.log(
            `Connection state change: ${peerConnection.connectionState}`
        );
    });

    peerConnection.addEventListener("signalingstatechange", () => {
        console.log(`Signaling state change: ${peerConnection.signalingState}`);
    });

    peerConnection.addEventListener("iceconnectionstatechange ", () => {
        console.log(
            `ICE connection state change: ${peerConnection.iceConnectionState}`
        );
    });
}

init();
