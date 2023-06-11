/** @type {RTCPeerConnection} */
let localConnection;

/** @type {RTCPeerConnection} */
let remoteConnection;

/** @type {RTCDataChannel} */
let sendChannel;

const onSendChannelStateChange = () => { };
const onError = () => { };
const receiveChannelCallback = () => { };

export async function createConnection() {
    localConnection = new RTCPeerConnection();
    sendChannel = localConnection.createDataChannel("sendDataChannel");

    sendChannel.addEventListener("open", onSendChannelStateChange);
    sendChannel.addEventListener("close", onSendChannelStateChange);
    sendChannel.addEventListener("error", onError);

    localConnection.addEventListener("icecandidate", async event => {
        console.log("Local ICE Candidate:", event.candidate);
        await remoteConnection.addIceCandidate(event.candidate);
    });

    remoteConnection.addEventListener("datachannel", receiveChannelCallback);
}
