/** @type {RTCPeerConnection} */
let localConnection;

/** @type {RTCPeerConnection} */
let remoteConnection;

/** @type {RTCDataChannel} */
let sendChannel;

/** @type {FileReader} */
let fileReader;

let receiveChannel;

let receiveBuffer = [];
let receivedSize = 0;

let bytesPrev = 0;
let timestampPrev = 0;
let timestampStart;
let statsInterval = null;
let bitrateMax = 0;

export async function createConnection() {
    localConnection = new RTCPeerConnection();
    console.log("Created local peer connection object localConnection");

    sendChannel = localConnection.createDataChannel("sendDataChannel");
    sendChannel.binaryType = "arraybuffer";
    console.log("Created send data channel");

    sendChannel.addEventListener("open", onSendChannelStateChange);
    sendChannel.addEventListener("close", onSendChannelStateChange);
    sendChannel.addEventListener("error", onError);

    localConnection.addEventListener("icecandidate", async event => {
        console.log("Local ICE candidate: ", event.candidate);
        await remoteConnection.addIceCandidate(event.candidate);
    });

    remoteConnection = new RTCPeerConnection();
    console.log("Created remote peer connection object remoteConnection");

    remoteConnection.addEventListener("icecandidate", async event => {
        console.log("Remote ICE candidate: ", event.candidate);
        await localConnection.addIceCandidate(event.candidate);
    });
    remoteConnection.addEventListener("datachannel", receiveChannelCallback);

    try {
        const offer = await localConnection.createOffer();
        await gotLocalDescription(offer);
    } catch (e) {
        console.log("Failed to create session description: ", e);
    }
}

function sendData() {
    /** @type {File} */
    let file;
    console.log(`File is ${[file.name, file.size, file.type, file.lastModified].join(" ")}`);

    // Handle 0 size files.
    if (file.size === 0) {
        closeDataChannels();
        return;
    }
    const chunkSize = 16384;
    fileReader = new FileReader();
    let offset = 0;
    fileReader.addEventListener("error", error => console.error("Error reading file:", error));
    fileReader.addEventListener("abort", event => console.log("File reading aborted:", event));
    fileReader.addEventListener("load", e => {
        console.log("FileRead.onload ", e);
        sendChannel.send(e.target.result);
        offset += e.target.result.byteLength;
        if (offset < file.size) {
            readSlice(offset);
        }
    });
    const readSlice = o => {
        console.log("readSlice ", o);
        const slice = file.slice(offset, o + chunkSize);
        fileReader.readAsArrayBuffer(slice);
    };
    readSlice(0);
}

function closeDataChannels() {
    console.log("Closing data channels");
    sendChannel.close();
    console.log(`Closed data channel with label: ${sendChannel.label}`);
    sendChannel = null;
    if (receiveChannel) {
        receiveChannel.close();
        console.log(`Closed data channel with label: ${receiveChannel.label}`);
        receiveChannel = null;
    }
    localConnection.close();
    remoteConnection.close();
    localConnection = null;
    remoteConnection = null;
    console.log("Closed peer connections");
}

async function gotLocalDescription(desc) {
    await localConnection.setLocalDescription(desc);
    console.log(`Offer from localConnection\n ${desc.sdp}`);
    await remoteConnection.setRemoteDescription(desc);
    try {
        const answer = await remoteConnection.createAnswer();
        await gotRemoteDescription(answer);
    } catch (e) {
        console.log("Failed to create session description: ", e);
    }
}

async function gotRemoteDescription(desc) {
    await remoteConnection.setLocalDescription(desc);
    console.log(`Answer from remoteConnection\n ${desc.sdp}`);
    await localConnection.setRemoteDescription(desc);
}

function receiveChannelCallback(event) {
    console.log("Receive Channel Callback");
    receiveChannel = event.channel;
    receiveChannel.binaryType = "arraybuffer";
    receiveChannel.onmessage = onReceiveMessageCallback;
    receiveChannel.onopen = onReceiveChannelStateChange;
    receiveChannel.onclose = onReceiveChannelStateChange;

    receivedSize = 0;
    bitrateMax = 0;
}

function onReceiveMessageCallback(event) {
    console.log(`Received Message ${event.data.byteLength}`);
    receiveBuffer.push(event.data);
    receivedSize += event.data.byteLength;

    // we are assuming that our signaling protocol told
    // about the expected file size (and name, hash, etc).
    /** @type {File} */
    let file;
    if (receivedSize === file.size) {
        const received = new Blob(receiveBuffer);
        receiveBuffer = [];

        const bitrate = Math.round(receivedSize * 8 /
            ((new Date()).getTime() - timestampStart));
        console.log(received, bitrate);

        if (statsInterval) {
            clearInterval(statsInterval);
            statsInterval = null;
        }

        closeDataChannels();
    }
}

function onSendChannelStateChange() {
    if (sendChannel) {
        const { readyState } = sendChannel;
        console.log(`Send channel state is: ${readyState}`);
        if (readyState === "open") {
            sendData();
        }
    }
}

function onError(error) {
    if (sendChannel) {
        console.error("Error in sendChannel:", error);
        return;
    }
    console.log("Error in sendChannel which is already closed:", error);
}

async function onReceiveChannelStateChange() {
    if (receiveChannel) {
        const readyState = receiveChannel.readyState;
        console.log(`Receive channel state is: ${readyState}`);
        if (readyState === "open") {
            timestampStart = (new Date()).getTime();
            timestampPrev = timestampStart;
            statsInterval = setInterval(displayStats, 500);
            await displayStats();
        }
    }
}

// display bitrate statistics.
async function displayStats() {
    if (remoteConnection && remoteConnection.iceConnectionState === "connected") {
        const stats = await remoteConnection.getStats();
        let activeCandidatePair;
        stats.forEach(report => {
            if (report.type === "transport") {
                activeCandidatePair = stats.get(report.selectedCandidatePairId);
            }
        });
        if (activeCandidatePair) {
            if (timestampPrev === activeCandidatePair.timestamp) {
                return;
            }
            // calculate current bitrate
            const bytesNow = activeCandidatePair.bytesReceived;
            const bitrate = Math.round((bytesNow - bytesPrev) * 8 /
                (activeCandidatePair.timestamp - timestampPrev));
            timestampPrev = activeCandidatePair.timestamp;
            bytesPrev = bytesNow;
            if (bitrate > bitrateMax) {
                bitrateMax = bitrate;
            }
        }
    }
}
