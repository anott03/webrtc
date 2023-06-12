/** @type {RTCPeerConnection} */
let localConnection;

/** @type {RTCPeerConnection} */
let remoteConnection;

/** @type {RTCDataChannel} */
let sendChannel;

/** @type {FileReader} */
let fileReader;

let receiveChannel;

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

function receiveChannelCallback() {
    console.log("Receive Channel Callback");
    receiveChannel = event.channel;
    receiveChannel.binaryType = "arraybuffer";
    receiveChannel.onmessage = onReceiveMessageCallback;
    receiveChannel.onopen = onReceiveChannelStateChange;
    receiveChannel.onclose = onReceiveChannelStateChange;

    receivedSize = 0;
    bitrateMax = 0;
    downloadAnchor.textContent = "";
    downloadAnchor.removeAttribute("download");
    if (downloadAnchor.href) {
        URL.revokeObjectURL(downloadAnchor.href);
        downloadAnchor.removeAttribute("href");
    }
}

/** @type {async (offer: RTCSessionDescriptionInit) => void} */
const getLocalDescription = async (offer) => {
    await remoteConnection.setLocalDescription(offer);
    await localConnection.setRemoteDescription(offer);
};

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

    remoteConnection = new RTCPeerConnection();
    remoteConnection.addEventListener("icecandidate", async event => {
        console.log("Remote ICE candidate: ", event.candidate);
        await localConnection.addIceCandidate(event.candidate);
    });
    remoteConnection.addEventListener("datachannel", receiveChannelCallback);

    try {
        const offer = await localConnection.createOffer();
        await getLocalDescription(offer);
    } catch (e) {
        console.error("Failed to create session description", e);
    }
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

export function sendData() {
    /**
    * TODO: get file
    * @type {File}
    */
    let file;
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

function onReceiveMessageCallback(event) {
    console.log(`Received Message ${event.data.byteLength}`);
    receiveBuffer.push(event.data);
    receivedSize += event.data.byteLength;
    receiveProgress.value = receivedSize;

    // we are assuming that our signaling protocol told
    // about the expected file size (and name, hash, etc).
    const file = fileInput.files[0];
    if (receivedSize === file.size) {
        const received = new Blob(receiveBuffer);
        receiveBuffer = [];

        const bitrate = Math.round(receivedSize * 8 /
            ((new Date()).getTime() - timestampStart));

        if (statsInterval) {
            clearInterval(statsInterval);
            statsInterval = null;
        }

        closeDataChannels();
    }
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
