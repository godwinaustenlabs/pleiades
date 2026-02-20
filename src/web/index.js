export const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Nova Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-base: #000000;
            --bg-secondary: #0a0a0c;
            --sidebar-bg: rgba(18, 18, 20, 0.7);
            --chat-bg: transparent;
            --accent: #007aff;
            --text-main: #ffffff;
            --text-dim: #8e8e93;
            --border: rgba(255, 255, 255, 0.08);
            --bubble-user: rgba(44, 44, 46, 0.6);
            --bubble-agent: rgba(0, 122, 255, 0.85);
            --bubble-manual: rgba(52, 199, 89, 0.85);
            --danger: #ff3b30;
            --success: #34c759;
            --glass-blur: blur(40px) saturate(180%);
            --refraction: 1px solid rgba(255, 255, 255, 0.12);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        html {
            height: 100%;
            overflow: hidden;
        }

        body {
            background: var(--bg-base);
            color: var(--text-main);
            height: 100dvh;
            display: flex;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            overflow: hidden;
            position: relative;
            margin: 0;
        }

        /* Liquid Background Elements */
        .bg-blobs {
            position: fixed;
            inset: 0;
            z-index: 0;
            overflow: hidden;
            background: #000;
            pointer-events: none;
        }

        .blob {
            position: absolute;
            border-radius: 50%;
            filter: blur(100px);
            opacity: 0.4;
            animation: move 20s infinite alternate cubic-bezier(0.45, 0.05, 0.55, 0.95);
        }

        .blob-1 {
            width: 600px; height: 600px;
            background: #007aff;
            top: -10%; left: -10%;
            animation-duration: 25s;
        }

        .blob-2 {
            width: 500px; height: 500px;
            background: #5856d6;
            bottom: -5%; right: -5%;
            animation-duration: 30s;
            animation-delay: -5s;
        }

        .blob-3 {
            width: 400px; height: 400px;
            background: #af52de;
            top: 40%; left: 50%;
            animation-duration: 22s;
            animation-delay: -10s;
        }

        @keyframes move {
            0% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(100px, 50px) scale(1.1); }
            66% { transform: translate(-50px, 100px) scale(0.9); }
            100% { transform: translate(50px, -50px) scale(1.05); }
        }

        /* Full App Layout */
        #app-container {
            display: flex;
            position: fixed;
            inset: 0;
            z-index: 1;
            overflow: hidden;
            background: var(--bg-base);
        }

        @media (max-width: 768px) {
            #sidebar {
                width: 100%;
                position: absolute;
                inset: 0;
                z-index: 20;
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            #sidebar.hidden {
                transform: translateX(-100%);
                pointer-events: none;
            }

            #main-view {
                padding-top: 0; /* Handle safe areas via env if needed */
            }
        }

        /* Sidebar */
        #sidebar {
            width: 300px;
            background: var(--sidebar-bg);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border-right: var(--refraction);
            display: flex;
            flex-direction: column;
            z-index: 10;
        }

        #sidebar-header {
            padding: 24px 20px 12px 20px;
        }

        #sidebar-header h1 {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }

        #client-list {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }

        .client-item {
            padding: 12px 16px;
            margin-bottom: 2px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            gap: 2px;
            border: 1px solid transparent;
        }

        .client-item:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .client-item.active {
            background: rgba(255, 255, 255, 0.1);
            border: var(--refraction);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }

        .client-item.active .client-name { color: var(--accent); }

        .client-name {
            font-weight: 600;
            font-size: 14px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            transition: color 0.2s;
        }

        .client-id {
            font-size: 11px;
            opacity: 0.5;
        }

        /* Main Area */
        #main-view {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: rgba(0,0,0,0.1);
            position: relative;
            min-height: 0;
            overflow: hidden;
        }

        #chat-header {
            height: 64px;
            padding: 0 16px;
            background: rgba(18, 18, 20, 0.6);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border-bottom: var(--refraction);
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 5;
            gap: 12px;
        }

        #mobile-back-btn {
            display: none;
            background: none;
            border: none;
            color: var(--accent);
            padding: 8px;
            cursor: pointer;
            border-radius: 8px;
        }

        @media (max-width: 768px) {
            #mobile-back-btn { display: flex; align-items: center; justify-content: center; }
            #chat-info h2 { font-size: 15px; }
            #chat-subtitle { font-size: 10px; }
            .header-actions .btn { padding: 6px 10px; font-size: 12px; }
            .agent-pill { padding: 4px 8px; font-size: 10px; }
        }

        #chat-info h2 {
            font-size: 16px;
            font-weight: 600;
        }

        #chat-subtitle {
            font-size: 11px;
            color: var(--text-dim);
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        /* Glass Style Buttons */
        .btn {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.05);
            color: white;
            padding: 7px 14px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            backdrop-filter: blur(10px);
        }

        .btn:hover { background: rgba(255, 255, 255, 0.12); transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }
        .btn.danger { color: #ff453a; }
        .btn.primary { background: var(--accent); color: white; border: none; }

        /* Agent Control */
        .agent-pill {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(255, 255, 255, 0.08);
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            border: 1px solid rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
        }

        /* Switch */
        .switch {
            position: relative;
            display: inline-block;
            width: 32px;
            height: 18px;
        }

        .switch input { opacity: 0; width: 0; height: 0; }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #3a3a3c;
            transition: .3s;
            border-radius: 20px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 14px; width: 14px;
            left: 2px; bottom: 2px;
            background-color: white;
            transition: .3s;
            border-radius: 50%;
        }

        input:checked + .slider { background-color: #34c759; }
        input:checked + .slider:before { transform: translateX(14px); }

        /* Messages */
        #messages-container {
            flex: 1; /* Ensure it takes available space */
            padding: 24px;
            overflow-y: auto;
            display: flex;
            flex-direction: column-reverse; /* Force native bottom pinning */
            gap: 12px;
            min-height: 0;
        }

        .date-separator {
            display: flex;
            justify-content: center;
            margin: 24px 0 12px 0;
            opacity: 0.8;
            font-size: 11px;
            font-weight: 500;
            color: var(--text-secondary);
            pointer-events: none;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .date-separator span {
            background: rgba(20, 20, 25, 0.6);
            padding: 4px 12px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(4px);
        }

        .message {
            max-width: 70%;
            padding: 10px 16px;
            border-radius: 20px;
            font-size: 15px;
            line-height: 1.4;
            position: relative;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            animation: messagePop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes messagePop {
            from { opacity: 0; transform: translateY(10px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .message.user {
            align-self: flex-start;
            background: var(--bubble-user);
            color: white;
            border-bottom-left-radius: 4px;
        }

        .message.agent {
            align-self: flex-end;
            background: var(--bubble-agent);
            color: white;
            border-bottom-right-radius: 4px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .message.agent_manual {
            align-self: flex-end;
            background: var(--bubble-manual);
            color: white;
            border-bottom-right-radius: 4px;
        }

        .message.system {
            align-self: center;
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            color: var(--text-dim);
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding: 6px 16px;
            border-radius: 20px;
            margin: 16px 0;
            border: var(--refraction);
        }

        .timestamp {
            font-size: 9px;
            opacity: 0.4;
            margin-top: 6px;
            display: block;
            text-align: right;
        }

        /* Input area */
        #input-area {
            padding: 12px 16px 24px 16px;
            background: rgba(18, 18, 20, 0.6);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border-top: var(--refraction);
            display: flex;
            gap: 10px;
            align-items: center;
        }

        #message-input {
            flex: 1;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.05);
            color: white;
            padding: 12px 16px;
            border-radius: 24px;
            outline: none;
            font-size: 16px; /* Prevent zoom on mobile */
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            height: 44px;
        }

        #message-input:focus {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(0, 122, 255, 0.5);
            box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.1);
        }

        #send-btn {
            background: var(--accent);
            border: none;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
        }

        #send-btn:hover { transform: scale(1.08) rotate(-5deg); filter: brightness(1.1); }
        #send-btn:active { transform: scale(0.92); }
        #send-btn:disabled { opacity: 0.2; transform: scale(0.9); cursor: not-allowed; }

        /* Empty State */
        #empty-state {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--text-dim);
            text-align: center;
            gap: 20px;
        }

        #empty-state svg {
            width: 80px;
            height: 80px;
            opacity: 0.1;
            filter: drop-shadow(0 0 20px rgba(0, 122, 255, 0.2));
        }

        /* Auth Overlay - macOS Style */
        .overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: #000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            gap: 24px;
        }

        .auth-card {
            background: rgba(255, 255, 255, 0.04);
            backdrop-filter: blur(60px);
            -webkit-backdrop-filter: blur(60px);
            padding: 48px;
            border-radius: 32px;
            border: var(--refraction);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 24px;
            width: 360px;
            box-shadow: 0 30px 60px rgba(0,0,0,0.6);
            animation: cardEntrance 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        @keyframes cardEntrance {
            from { opacity: 0; transform: translateY(30px) scale(0.9); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .avatar-placeholder {
            width: 90px;
            height: 90px;
            background: linear-gradient(135deg, #007aff, #5856d6, #af52de);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 8px;
            box-shadow: 0 10px 20px rgba(0, 122, 255, 0.3);
        }

        .auth-card h2 {
            font-size: 20px;
            font-weight: 600;
            letter-spacing: -0.5px;
        }

        .auth-card input {
            width: 100%;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: white;
            padding: 14px;
            border-radius: 14px;
            text-align: center;
            font-size: 16px;
            outline: none;
            transition: all 0.3s;
        }

        .auth-card input:focus {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .auth-card button {
            width: 100%;
            padding: 14px;
            border-radius: 14px;
            font-weight: 600;
            font-size: 15px;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
    </style>
</head>
<body>
    <div class="bg-blobs">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
        <div class="blob blob-3"></div>
    </div>

    <div id="app-container">
        <aside id="sidebar">
            <header id="sidebar-header">
                <h1>Conversations</h1>
            </header>
            <div id="client-list">
                <!-- Clients injected here -->
            </div>
        </aside>

        <main id="main-view">
            <div id="chat-placeholder" style="display: grid; place-items: center; background: var(--bg-base);">
                <div id="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                        <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <p style="opacity: 0.5; font-size: 14px;">Select a person to see the neural stream</p>
                </div>
            </div>

            <div id="chat-active" style="display: none; flex-direction: column; height: 100%; min-height: 0;">
                <header id="chat-header">
                    <button id="mobile-back-btn" onclick="showSidebar()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>
                    <div id="chat-info">
                        <h2 id="chat-title">-</h2>
                        <div id="chat-subtitle"></div>
                    </div>
                    
                    <div id="header-actions" class="header-actions">
                        <div class="agent-pill">
                            <span id="agent-status-label">Agent Active</span>
                            <label class="switch">
                                <input type="checkbox" id="agent-switch" onchange="toggleAgent()">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <button class="btn" onclick="renameClient()">Rename</button>
                        <button class="btn danger" onclick="deleteClient()">Delete</button>
                    </div>
                </header>
                
                <div id="messages-container"></div>
                
                <footer id="input-area">
                    <input type="text" id="message-input" placeholder="Neural Reply..." disabled>
                    <button id="send-btn" disabled>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </footer>
            </div>
        </main>
    </div>

    <div id="auth-overlay" class="overlay">
        <div class="auth-card">
            <div class="avatar-placeholder">N</div>
            <h2>Nova OS</h2>
            <input type="password" id="auth-input" placeholder="Access Key">
            <button class="btn primary" id="auth-btn" onclick="checkAuth()">Authorize</button>
        </div>
    </div>

    <script>
        let currentClientID = null;
        let socket = null;
        let clientMetadata = {};

        // [FLOW 1] Auth
        const dashboardToken = localStorage.getItem('nova_dashboard_token');
        if (dashboardToken) {
            document.getElementById('auth-overlay').style.display = 'none';
            fetchClients();
        }

        function checkAuth() {
            const val = document.getElementById('auth-input').value;
            localStorage.setItem('nova_dashboard_token', val);
            location.reload();
        }

        document.getElementById('auth-input').onkeypress = (e) => { if (e.key === 'Enter') checkAuth(); };

        // Mobile Navigation
        const isMobile = () => window.innerWidth <= 768;

        function showSidebar() {
            document.getElementById('sidebar').classList.remove('hidden');
        }

        function hideSidebar() {
            if (isMobile()) {
                document.getElementById('sidebar').classList.add('hidden');
            }
        }
        async function authFetch(url, options = {}) {
            options.headers = { ...options.headers, 'X-Dashboard-Token': localStorage.getItem('nova_dashboard_token') };
            const res = await fetch(url, options);
            if (res.status === 401) { localStorage.removeItem('nova_dashboard_token'); location.reload(); }
            return res;
        }

        async function fetchClients() {
            try {
                const res = await authFetch('/api/clients');
                // Handle non-JSON response gracefully
                const text = await res.text();
                let clients = [];
                try {
                    clients = JSON.parse(text);
                } catch (e) {
                    console.error('Failed to parse clients JSON:', text);
                }
                
                if (!Array.isArray(clients)) clients = [];

                for (const id of clients) {
                    try {
                        if (!clientMetadata[id]) {
                            const infoRes = await authFetch(\`/api/client_info?clientID=\${id}\`);
                            clientMetadata[id] = await infoRes.json();
                        }
                    } catch (e) { console.error('Failed to fetch metadata for', id); }
                }
                updateSidebar(clients);
            } catch (err) { 
                console.error('Fetch Clients Error:', err);
                // Even if it fails, ensuring the UI is usable
                updateSidebar([]);
            }
        }

        function updateSidebar(clients) {
            const list = document.getElementById('client-list');
            list.innerHTML = '';
            clients.forEach(id => {
                const meta = clientMetadata[id] || {};
                const div = document.createElement('div');
                div.className = \`client-item \${id === currentClientID ? 'active' : ''}\`;
                div.innerHTML = \`
                    <div class="client-name">\${meta.friendlyName || id}</div>
                    <div class="client-id">\${id.substring(0, 8)}...</div>
                \`;
                div.onclick = () => {
                    loadClient(id);
                    hideSidebar();
                };
                list.appendChild(div);
            });
        }

        async function loadClient(id) {
            if (currentClientID === id) return;
            currentClientID = id;
            
            document.getElementById('chat-placeholder').style.display = 'none';
            document.getElementById('chat-active').style.display = 'flex';
            
            const meta = clientMetadata[id] || {};
            document.getElementById('chat-title').innerText = meta.friendlyName || id;
            document.getElementById('chat-subtitle').innerText = meta.friendlyName ? id : '';
            
            document.getElementById('message-input').disabled = false;
            document.getElementById('send-btn').disabled = false;
            
            updateSidebar(Object.keys(clientMetadata));
            
            if (socket) socket.close();
            fetchMessages();
            fetchAgentStatus();
            connectWebSocket(id);
        }

        async function renameClient() {
            const newName = prompt("Enter friendly name for this client:", clientMetadata[currentClientID]?.friendlyName || "");
            if (newName === null) return;
            
            await authFetch(\`/api/client_info?clientID=\${currentClientID}\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friendlyName: newName })
            });
            clientMetadata[currentClientID].friendlyName = newName;
            document.getElementById('chat-title').innerText = newName || currentClientID;
            updateSidebar(Object.keys(clientMetadata));
        }

        async function deleteClient() {
            if (!confirm(\`Are you sure you want to delete \${currentClientID}? This will wipe ALL data.\`)) return;
            await authFetch(\`/api/delete_client?clientID=\${currentClientID}\`, { method: 'POST' });
            location.reload(); 
        }

        async function fetchAgentStatus() {
            const res = await authFetch(\`/api/agent_status?clientID=\${currentClientID}\`);
            const { enabled } = await res.json();
            updateAgentUI(enabled);
        }

        async function toggleAgent() {
            const enabled = document.getElementById('agent-switch').checked;
            updateAgentUI(enabled);
            await authFetch(\`/api/agent_status?clientID=\${currentClientID}\`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
        }

        function updateAgentUI(enabled) {
            const label = document.getElementById('agent-status-label');
            const toggle = document.getElementById('agent-switch');
            toggle.checked = enabled;
            label.innerText = enabled ? 'Neural Active' : 'Manual Override';
            label.style.color = enabled ? '#34c759' : '#ff3b30';
        }

        function connectWebSocket(id) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const token = localStorage.getItem('nova_dashboard_token');
            const wsUrl = \`\${protocol}//\${window.location.host}/api/ws?clientID=\${id}&token=\${token}\`;
            
            socket = new WebSocket(wsUrl);
            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'agent_status') {
                    updateAgentUI(data.enabled);
                } else if (data.type === 'client_info') {
                    clientMetadata[id].friendlyName = data.friendlyName;
                    if (currentClientID === id) document.getElementById('chat-title').innerText = data.friendlyName || id;
                    updateSidebar(Object.keys(clientMetadata));
                } else if (data.type === 'notification') {
                    appendMessage({ sender: 'system', text: data.text, timestamp: new Date().toISOString() });
                } else {
                    appendMessage(data);
                }
            };
            socket.onclose = () => { if (currentClientID === id) setTimeout(() => connectWebSocket(id), 3000); };
        }

        function getDayString(date) {
            const d = new Date(date);
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            if (d.toDateString() === today.toDateString()) return 'Today';
            if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
            return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
        }

        function appendMessage(msg) {
            const container = document.getElementById('messages-container');
            const msgDate = new Date(msg.timestamp);
            const currDateStr = msgDate.toDateString();
            
            // In column-reverse, the 'last' message (visually bottom) is the first child
            let lastMsg = container.firstElementChild;
            let prevDateStr = null;
            
            if (lastMsg && lastMsg.classList.contains('message')) {
                 prevDateStr = lastMsg.dataset.dateString;
            }

            // Insert separator if new day
            if (currDateStr !== prevDateStr) {
                const sep = document.createElement('div');
                sep.className = 'date-separator';
                sep.innerHTML = \`<span>\${getDayString(msgDate)}</span>\`;
                container.prepend(sep);
            }

            const div = document.createElement('div');
            div.className = \`message \${msg.sender}\`;
            div.dataset.dateString = currDateStr;
            div.innerHTML = \`
                \${msg.text}
                <span class="timestamp">\${msgDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            \`;
            container.prepend(div);
        }

        async function fetchMessages() {
            if (!currentClientID) return;
            const res = await authFetch(\`/api/messages?clientID=\${currentClientID}\`);
            let messages = await res.json();
            const container = document.getElementById('messages-container');
            container.innerHTML = '';
            
            // Loop through oldest to newest and prepend to keep newest at visual bottom
            messages.forEach(msg => appendMessage(msg));
        }

        async function sendMessage() {
            const input = document.getElementById('message-input');
            const message = input.value.trim();
            if (!message || !currentClientID) return;
            input.value = '';
            await authFetch('/api/send', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactID: currentClientID, message })
            });
        }

        document.getElementById('send-btn').onclick = sendMessage;
        document.getElementById('message-input').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

        setInterval(fetchClients, 15000);
    </script>
</body>
</html>
`;
