import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useRouter } from 'expo-router';
import axios from 'axios';

import { Button } from '@/components/nativewindui/Button';
import { Text } from '@/components/nativewindui/Text';
import { useDeviceStore } from '@/store/useDeviceStore';
import { getFirebaseDb } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Step 2 — Add the Pi URL Constant
const PI_URL = 'http://192.168.43.100:8000';   // e.g. 'http://192.168.1.50'
const LIVEKIT_URL = 'wss://iris-j5kpm27o.livekit.cloud';
const ROOM_NAME = 'iris-demo-room';

// Inlined HTML for LiveKit Client
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LiveKit Video Call</title>
  <!-- Change A — Pin the livekit-client version -->
  <script src="https://cdn.jsdelivr.net/npm/livekit-client@2.5.8/dist/livekit-client.umd.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw; height: 100vh;
      background: #1a1a1a;
      display: flex;
      flex-direction: column;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto;
    }
    #video-container {
      flex: 1;
      position: relative;
    }
    #remote-videos {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 10px;
      padding: 10px;
      height: 100%;
    }
    .participant-video {
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
    }
    .participant-video video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    #local-video {
      position: absolute;
      bottom: 20px;
      right: 20px;
      width: 120px;
      height: 160px;
      border-radius: 8px;
      background: #000;
      border: 2px solid #0066cc;
      z-index: 10;
    }
    #local-video video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
    }
    #controls {
      display: none; /* Hide controls for Iris User prototype */
    }
    #status {
      padding: 10px;
      text-align: center;
      font-size: 12px;
      color: #999;
    }
  </style>
</head>
<body>
  <div id="video-container">
    <div id="remote-videos"></div>
    <div id="local-video">
      <video autoplay muted playsinline></video>
    </div>
  </div>
  <div id="status">Initializing...</div>

  <script>
    const state = {
      room: null,
      cameraEnabled: false,
      micEnabled: false,
    };

    const elements = {
      status: document.getElementById('status'),
      localVideo: document.querySelector('#local-video video'),
      remoteVideos: document.getElementById('remote-videos'),
    };

    function sendMessage(type, payload = {}) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
      }
    }

    // Change C — Replace the entire joinRoom function
    async function safeEnableCameraAndMicrophone(room) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        sendMessage('ERROR', { 
          error: 'Camera not available in this WebView context. Check Android permissions.' 
        });
        return false;
      }
      try {
        await room.localParticipant.enableCameraAndMicrophone();
        return true;
      } catch (err) {
        sendMessage('ERROR', { error: 'Camera access denied: ' + err.message });
        return false;
      }
    }

    async function joinRoom(token, serverUrl, cameraMode) {
      try {
        sendMessage('READY', { status: 'connecting' });
        state.room = new LivekitClient.Room();

        state.room.on(LivekitClient.RoomEvent.Connected, () => {
          sendMessage('READY', { status: 'connected' });
        });

        state.room.on(LivekitClient.RoomEvent.Disconnected, () => {
          sendMessage('READY', { status: 'disconnected' });
          elements.remoteVideos.innerHTML = '';
        });

        state.room.on(LivekitClient.RoomEvent.TrackSubscribed, (_track, _pub, participant) => {
          addRemoteVideo(participant);
        });

        await state.room.connect(serverUrl, token);

        if (cameraMode === 'phone') {
          // FALLBACK PATH — Pi was unreachable, publish phone camera
          sendMessage('CAMERA_MODE', { mode: 'phone' });
          
          const success = await safeEnableCameraAndMicrophone(state.room);
          if (!success) return;   // error already sent to React Native

          const videoTrack = Array.from(
            state.room.localParticipant.videoTrackPublications.values()
          )[0]?.track;

          if (videoTrack) videoTrack.attach(elements.localVideo);
          state.cameraEnabled = true;
          state.micEnabled = true;

        } else {
          // PI PATH — Pi is streaming, phone just subscribes + enables mic
          sendMessage('CAMERA_MODE', { mode: 'pi' });
          document.getElementById('local-video').style.display = 'none';
          await state.room.localParticipant.setMicrophoneEnabled(true);
          state.micEnabled = true;
        }

      } catch (err) {
        sendMessage('ERROR', { error: err.message });
        console.error(err);
      }
    }

    // Change D — Fix addRemoteVideo to use Map API
    function addRemoteVideo(participant) {
      const existing = document.getElementById('video-' + participant.sid);
      if (existing) return;

      const div = document.createElement('div');
      div.id = 'video-' + participant.sid;
      div.className = 'participant-video';

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsinline = true;
      div.appendChild(video);
      elements.remoteVideos.appendChild(div);

      // videoTrackPublications is a Map in livekit-client v2+
      const videoTrack = Array.from(
        participant.videoTrackPublications.values()
      )[0]?.track;

      if (videoTrack) videoTrack.attach(video);
    }

    async function disconnect() {
      if (state.room) {
        await state.room.disconnect();
        state.room = null;
      }
    }

    // Change E — Pass cameraMode through the message listener
    document.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'JOIN_ROOM') {
          joinRoom(data.token, data.serverUrl, data.cameraMode);  // added cameraMode
        } else if (data.type === 'LEAVE_ROOM') {
          disconnect();
        }
      } catch (err) {
        console.error(err);
      }
    });

    // Change B — Fix WEB_READY firing twice
    window.addEventListener('load', () => {
      sendMessage('WEB_READY');
    });
    
    elements.status.textContent = 'WebView loaded. Waiting...';
  </script>
</body>
</html>
`;

interface WebViewMessage {
  type: 'WEB_READY' | 'READY' | 'ERROR' | 'CAMERA_MODE';
  status?: string;
  error?: string;
  mode?: 'pi' | 'phone';
}

export default function UserCallScreen() {
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('Initializing...');
  const [permissionsReady, setPermissionsReady] = useState(false);

  const requestCallPermissions = async () => {
    if (Platform.OS !== 'android') return true;

    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        
      ]);

      return (
        granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (err) {
      console.warn(err);
      return false;
    }
  };

  // 1. Request permissions upfront (Android)
  useEffect(() => {
    requestCallPermissions().then((ok) => {
      if (!ok) {
        console.warn('[Camera] Permissions denied');
        Alert.alert('Permission Error', 'Camera and Audio permissions are required for video calls.');
        router.back();
      } else {
        setPermissionsReady(true);
      }
    });
  }, []);
  
  // Step 3 — Add New State and Refs Inside the Component
  const callStartedRef = useRef(false);                           // prevents double-firing
  const [cameraMode, setCameraMode] = useState<'pi' | 'phone' | null>(null);

  const getToken = async (roomName: string, participantName: string) => {
    try {
      console.log(`[Call Flow] getToken called for room: ${roomName}, participant: ${participantName}`);
      const tokenUrl = 'http://10.68.76.220:3000/token';
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomName, name: participantName }),
      });
      const data = await response.json();
      console.log(`[Call Flow] Token received: ${data.token ? 'YES' : 'NO'}`);
      return data.token;
    } catch (e) {
      console.error('[Call Flow] Token fetch failed:', e);
      return null;
    }
  };

  // Step 4 — Add the Two Helper Functions
  // Pings the Pi with a 3-second timeout — returns true/false, never throws
  const checkPiReachable = async (): Promise<boolean> => {
    try {
      await axios.get(`${PI_URL}/health`, { timeout: 3000 });
      console.log('[Camera] Pi is reachable');
      return true;
    } catch {
      console.log('[Camera] Pi is unreachable');
      return false;
    }
  };

  // Tells the Pi to join the LiveKit room with its camera
  const signalPiToJoin = async (roomName: string): Promise<void> => {
    await axios.post(`${PI_URL}/join-room`, {
      room: roomName,
      serverUrl: LIVEKIT_URL,
    }, { timeout: 5000 });
  };

  // Step 5 — Replace Your Entire startCall Function
  const startCall = async () => {
    // Guard 1 — WebView not mounted yet
    if (!webViewRef.current) {
      console.log('[Call Flow] WebView ref is null, skipping');
      return;
    }

    // Guard 2 — already running, prevents double-fire from WEB_READY
    if (callStartedRef.current) {
      console.log('[Call Flow] Call already in progress, skipping duplicate');
      return;
    }
    callStartedRef.current = true;

    // ── Step A: Check Pi ──────────────────────────────────────
    setStatusText('Checking Pi camera...');
    const piReachable = await checkPiReachable();
    let resolvedCameraMode: 'pi' | 'phone';

    if (piReachable) {
      resolvedCameraMode = 'pi';
      // Signal Pi to join — if this fails after the health check, fall through
      await signalPiToJoin(ROOM_NAME).catch((e) => {
        console.warn('[Camera] Pi signal failed:', e.message);
      });
    } else {
      resolvedCameraMode = 'phone';
    }

    setCameraMode(resolvedCameraMode);
    console.log(`[Camera] Mode selected: ${resolvedCameraMode}`);

    // ── Step B: Get Token ─────────────────────────────────────
    setStatusText('Getting token...');
    const token = await getToken(ROOM_NAME, 'Iris_User');

    if (!token || typeof token !== 'string') {
      Alert.alert('Error', 'Failed to get token. Is token-server running?');
      callStartedRef.current = false;
      return;
    }

    // ── Step C: Send to WebView ───────────────────────────────
    // Check ref again — component may have unmounted during the async calls above
    if (!webViewRef.current) {
      console.error('[Call Flow] WebView unmounted before JOIN_ROOM could be sent');
      callStartedRef.current = false;
      return;
    }

    // Signal to Caregiver via Firestore
    const deviceId = useDeviceStore.getState().deviceId;
    if (deviceId) {
      const callSignalRef = doc(getFirebaseDb(), 'devices', deviceId, 'callSignal', 'status');
      await setDoc(callSignalRef, {
        initiatedBy: 'user',
        roomName: ROOM_NAME,
        status: 'ringing',
        timestamp: serverTimestamp(),
      });
    }

    setStatusText('Joining room...');
    webViewRef.current.postMessage(JSON.stringify({
      type: 'JOIN_ROOM',
      token,
      serverUrl: LIVEKIT_URL,
      cameraMode: resolvedCameraMode,   // WebView uses this to decide what to publish
    }));
  };

  // Step 6 — Add Cleanup to useEffect
  useEffect(() => {
    if (isWebViewReady) {
      startCall();
    }

    // Reset guard when component unmounts so re-navigation works
    return () => {
      callStartedRef.current = false;
    };
  }, [isWebViewReady]);

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const message: WebViewMessage = JSON.parse(event.nativeEvent.data);
      console.log('[Call Flow] Message from WebView:', message);

      switch (message.type) {
        case 'WEB_READY':
          setIsWebViewReady(true);
          setStatusText('Ready to start call');
          break;
        case 'READY':
          if (message.status === 'connected') {
            setIsCallActive(true);
            setStatusText('Call connected');
          } else if (message.status === 'disconnected') {
            setIsCallActive(false);
            setStatusText('Disconnected');
            callStartedRef.current = false;
            router.back();
          } else if (message.status === 'connecting') {
            setStatusText('Connecting...');
          }
          break;
        case 'ERROR':
          setStatusText(`Error: ${message.error}`);
          Alert.alert('Call Error', message.error);
          callStartedRef.current = false;
          break;
        // Step 7 — Add the Camera Mode Case to handleWebViewMessage
        case 'CAMERA_MODE':
          console.log('[Camera] WebView confirmed mode:', message.mode);
          break;
      }
    } catch (error) {
      console.error('Message parse error:', error);
    }
  };

  const endCall = async () => {
    console.log('[Call Flow] endCall initiated');
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({ type: 'LEAVE_ROOM' }));
      setIsCallActive(false);
      setStatusText('Ending call...');
      callStartedRef.current = false;

      const deviceId = useDeviceStore.getState().deviceId;
      if (deviceId) {
        const callSignalRef = doc(getFirebaseDb(), 'devices', deviceId, 'callSignal', 'status');
        await setDoc(callSignalRef, {
          status: 'ended'
        }, { merge: true });
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        {permissionsReady && (
          <WebView
            ref={webViewRef}
            source={{ html: htmlContent }}
            style={styles.webView}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback={true}
            mixedContentMode="always"
            originWhitelist={['*']}
          />
        )}
      </View>

      {!isCallActive ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <View style={styles.preCallContainer}>
            <Text variant="largeTitle" style={styles.title}>Remote Assistance</Text>
            <Text style={styles.status}>{statusText}</Text>
            {isLoading && <ActivityIndicator size="large" color="#1A6BFF" />}
          </View>
        </View>
      ) : (
        // Step 9 — Update the UI to Show Camera Mode
        <View style={styles.controlsOverlay}>
          <View style={styles.cameraModeBadge}>
            <Text style={styles.cameraModeText}>
              {cameraMode === 'pi' ? '📡 Pi Camera' : '📱 Phone Camera'}
            </Text>
          </View>
          <View style={styles.controlsContainer}>
            <Button onPress={endCall} variant="tonal" className="bg-red-600">
              <Text className="text-white font-bold">End Call</Text>
            </Button>
          </View>
        </View>
      )}

      <Text style={styles.debug}>
        WebView: {isWebViewReady ? '✓' : '✗'} | {statusText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  preCallContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: { color: '#fff', marginBottom: 16 },
  status: { fontSize: 14, color: '#999', marginBottom: 24 },
  webView: { flex: 1, backgroundColor: '#000' },
  overlay: { backgroundColor: 'rgba(0,0,0,0.8)' },
  controlsOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  controlsContainer: {
    padding: 20,
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20
  },
  debug: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    fontSize: 10,
    color: '#666',
    padding: 8,
    backgroundColor: '#1a1a1a',
  },
  // Step 9 — Add to your StyleSheet
  cameraModeBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 8,
  },
  cameraModeText: {
    color: '#fff',
    fontSize: 12,
  },
});
