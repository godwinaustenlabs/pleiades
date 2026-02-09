export const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nova WhatsApp Interface</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-dark: #0f172a;
            --sidebar-bg: #1e293b;
            --chat-bg: #0f172a;
            --accent: #38bdf8;
            --text-main: #f8fafc;
            --text-dim: #94a3b8;
            --glass: rgba(30, 41, 59, 0.7);
            --border: rgba(255, 255, 255, 0.1);
            --danger: #ef4444;
            --success: #10b981;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Outfit', sans-serif;
        }

        body {
            background: var(--bg-dark);
            color: var(--text-main);
            height: 100vh;
            display: flex;
            overflow: hidden;
        }

        /* Sidebar */
        #sidebar {
            width: 350px;
            background: var(--sidebar-bg);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
        }

        #sidebar-header {
            padding: 20px;
            font-size: 1.5rem;
            font-weight: 600;
            border-bottom: 1px solid var(--border);
            background: rgba(0,0,0,0.2);
        }

        #client-list {
            flex: 1;
            overflow-y: auto;
        }

        .client-item {
            padding: 15px 20px;
            border-bottom: 1px solid var(--border);
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .client-item:hover {
            background: rgba(255,255,255,0.05);
        }

        .client-item.active {
            background: var(--accent);
            color: var(--bg-dark);
        }
        
        .client-id {
            font-size: 0.75rem;
            opacity: 0.6;
        }

        .client-name {
            font-weight: 600;
        }

        /* Main Chat Area */
        #main-chat {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: var(--chat-bg);
            position: relative;
        }

        #chat-header {
            padding: 15px 25px;
            background: var(--sidebar-bg);
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #chat-info {
            display: flex;
            flex-direction: column;
        }

        #chat-title {
            font-weight: 600;
            font-size: 1.1rem;
        }
        
        #chat-subtitle {
            font-size: 0.8rem;
            color: var(--text-dim);
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .action-btn {
            background: rgba(255,255,255,0.1);
            border: 1px solid var(--border);
            color: white;
            padding: 6px 12px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: all 0.2s;
        }

        .action-btn:hover { background: rgba(255,255,255,0.2); }
        .action-btn.danger { color: #fca5a5; border-color: #7f1d1d; }
        .action-btn.danger:hover { background: #7f1d1d; color: white; }

        /* Agent Switch */
        .agent-control {
            display: flex;
            align-items: center;
            gap: 10px;
            background: rgba(0,0,0,0.2);
            padding: 5px 12px;
            border-radius: 20px;
            border: 1px solid var(--border);
        }

        .switch {
            position: relative;
            display: inline-block;
            width: 38px;
            height: 20px;
        }

        .switch input { opacity: 0; width: 0; height: 0; }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: var(--danger);
            transition: .4s;
            border-radius: 34px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 14px; width: 14px;
            left: 3px; bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }

        input:checked + .slider { background-color: var(--success); }
        input:checked + .slider:before { transform: translateX(18px); }

        #agent-status-label {
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: uppercase;
        }

        #messages-container {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 15px;
            background: radial-gradient(circle at top right, rgba(56, 189, 248, 0.05), transparent);
        }

        .message {
            max-width: 70%;
            padding: 12px 18px;
            border-radius: 15px;
            line-height: 1.5;
            position: relative;
            animation: fadeIn 0.15s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
            align-self: flex-start;
            background: var(--glass);
            border: 1px solid var(--border);
            border-bottom-left-radius: 2px;
        }

        .message.agent {
            align-self: flex-end;
            background: var(--accent);
            color: var(--bg-dark);
            border-bottom-right-radius: 2px;
            font-weight: 500;
        }

        .message.agent_manual {
            align-self: flex-end;
            background: var(--success);
            color: white;
            border-bottom-right-radius: 2px;
        }
        
        .message.system {
            align-self: center;
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text-dim);
            font-size: 0.8rem;
            padding: 5px 15px;
            border-radius: 20px;
            font-style: italic;
        }

        .timestamp {
            font-size: 0.7rem;
            opacity: 0.6;
            margin-top: 5px;
            display: block;
        }

        #input-area {
            padding: 20px;
            background: var(--sidebar-bg);
            border-top: 1px solid var(--border);
            display: flex;
            gap: 10px;
        }

        #message-input {
            flex: 1;
            background: rgba(0,0,0,0.2);
            border: 1px solid var(--border);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            outline: none;
        }

        #send-btn {
            background: var(--accent);
            border: none;
            color: var(--bg-dark);
            padding: 10px 25px;
            border-radius: 25px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }

        #send-btn:hover { transform: scale(1.05); }
        #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Auth/Overlay */
        .overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: var(--bg-dark);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            gap: 20px;
        }

        .overlay input {
            background: var(--sidebar-bg);
            border: 1px solid var(--border);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            font-size: 1.1rem;
            width: 300px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div id="sidebar">
        <div id="sidebar-header">Nova Conversations</div>
        <div id="client-list"></div>
    </div>

    <div id="main-chat">
        <div id="chat-header">
            <div id="chat-info">
                <div id="chat-title">Select a client</div>
                <div id="chat-subtitle"></div>
            </div>
            
            <div id="header-actions" class="header-actions" style="display: none;">
                <!-- Agent Switch -->
                <div class="agent-control">
                    <span id="agent-status-label">Agent Active</span>
                    <label class="switch">
                        <input type="checkbox" id="agent-switch" onchange="toggleAgent()">
                        <span class="slider"></span>
                    </label>
                </div>
                <!-- Mgmt Buttons -->
                <button class="action-btn" onclick="renameClient()">Rename</button>
                <button class="action-btn danger" onclick="deleteClient()">Delete</button>
            </div>
        </div>
        
        <div id="messages-container"></div>
        
        <div id="input-area">
            <input type="text" id="message-input" placeholder="Type a manual reply..." disabled>
            <button id="send-btn" disabled>Send</button>
        </div>
    </div>

    <div id="auth-overlay" class="overlay">
        <h2>Enter Admin Password</h2>
        <input type="password" id="auth-input" placeholder="Password">
        <button id="send-btn" onclick="checkAuth()">Unlock Dashboard</button>
    </div>

    <script>
        let currentClientID = null;
        let socket = null;
        let clientMetadata = {}; // Store friendly names for all clients

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

        async function authFetch(url, options = {}) {
            options.headers = { ...options.headers, 'X-Dashboard-Token': localStorage.getItem('nova_dashboard_token') };
            const res = await fetch(url, options);
            if (res.status === 401) { localStorage.removeItem('nova_dashboard_token'); location.reload(); }
            return res;
        }

        // [FLOW 2] Clients Sidebar
        async function fetchClients() {
            try {
                const res = await authFetch('/api/clients');
                const clients = await res.json();
                
                // Fetch info for each client to get friendly names
                for (const id of clients) {
                    if (!clientMetadata[id]) {
                        const infoRes = await authFetch(\`/api/client_info?clientID=\${id}\`);
                        clientMetadata[id] = await infoRes.json();
                    }
                }
                updateSidebar(clients);
            } catch (err) { console.error(err); }
        }

        function updateSidebar(clients) {
            const list = document.getElementById('client-list');
            list.innerHTML = '';
            clients.forEach(id => {
                const meta = clientMetadata[id] || {};
                const div = document.createElement('div');
                div.className = \`client-item \${id === currentClientID ? 'active' : ''}\`;
                
                const name = document.createElement('span');
                name.className = 'client-name';
                name.innerText = meta.friendlyName || id;
                
                const cid = document.createElement('span');
                cid.className = 'client-id';
                cid.innerText = id;
                
                div.appendChild(name);
                if (meta.friendlyName) div.appendChild(cid);
                
                div.onclick = () => selectClient(id);
                list.appendChild(div);
            });
        }

        // [FLOW 3] Select Client
        async function selectClient(id) {
            if (currentClientID === id) return;
            currentClientID = id;
            
            const meta = clientMetadata[id] || {};
            document.getElementById('chat-title').innerText = meta.friendlyName || id;
            document.getElementById('chat-subtitle').innerText = meta.friendlyName ? id : '';
            
            document.getElementById('message-input').disabled = false;
            document.getElementById('send-btn').disabled = false;
            document.getElementById('header-actions').style.display = 'flex';
            
            updateSidebar(Object.keys(clientMetadata)); // Refresh highlight
            
            if (socket) socket.close();
            fetchMessages();
            fetchAgentStatus();
            connectWebSocket(id);
        }

        // [FLOW 4] Management Actions
        async function renameClient() {
            const newName = prompt("Enter friendly name for this client:", clientMetadata[currentClientID]?.friendlyName || "");
            if (newName === null) return;
            
            await authFetch(\`/api/client_info?clientID=\${currentClientID}\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friendlyName: newName })
            });
            // Update local state
            clientMetadata[currentClientID].friendlyName = newName;
            selectClient(currentClientID); // Refreshes UI
        }

        async function deleteClient() {
            if (!confirm(\`Are you sure you want to delete \${currentClientID}? This will wipe ALL messages.\`)) return;
            
            await authFetch(\`/api/delete_client?clientID=\${currentClientID}\`, { method: 'POST' });
            
            // Clean up and reset
            delete clientMetadata[currentClientID];
            currentClientID = null;
            document.getElementById('header-actions').style.display = 'none';
            document.getElementById('chat-title').innerText = 'Select a client';
            document.getElementById('chat-subtitle').innerText = '';
            document.getElementById('messages-container').innerHTML = '';
            document.getElementById('message-input').disabled = true;
            document.getElementById('send-btn').disabled = true;
            if (socket) socket.close();
            fetchClients();
        }

        async function fetchAgentStatus() {
            const res = await authFetch(\`/api/agent_status?clientID=\${currentClientID}\`);
            const { enabled } = await res.json();
            updateAgentUI(enabled);
        }

        async function toggleAgent() {
            const enabled = document.getElementById('agent-switch').checked;
            await authFetch(\`/api/agent_status?clientID=\${currentClientID}\`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
        }

        function updateAgentUI(enabled) {
            const label = document.getElementById('agent-status-label');
            const toggle = document.getElementById('agent-switch');
            toggle.checked = enabled;
            label.innerText = enabled ? 'Agent Active' : 'Human Mode';
            label.style.color = enabled ? 'var(--success)' : 'var(--danger)';
        }

        // [FLOW 5] WebSocket (Real-Time)
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
                    if (currentClientID === id) {
                        document.getElementById('chat-title').innerText = data.friendlyName || id;
                        document.getElementById('chat-subtitle').innerText = data.friendlyName ? id : '';
                    }
                    updateSidebar(Object.keys(clientMetadata));
                } else if (data.type === 'deleted') {
                    if (currentClientID === id) location.reload();
                } else if (data.type === 'notification') {
                    appendMessage({ sender: 'system', text: data.text, timestamp: new Date().toISOString() });
                } else {
                    appendMessage(data);
                }
            };
            socket.onclose = () => { if (currentClientID === id) setTimeout(() => connectWebSocket(id), 3000); };
        }

        function appendMessage(msg) {
            const container = document.getElementById('messages-container');
            const div = document.createElement('div');
            div.className = \`message \${msg.sender}\`;
            div.innerHTML = \`
                \${msg.text}
                <span class="timestamp">\${new Date(msg.timestamp).toLocaleTimeString()}</span>
            \`;
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
        }

        async function fetchMessages() {
            if (!currentClientID) return;
            const res = await authFetch(\`/api/messages?clientID=\${currentClientID}\`);
            let messages = await res.json();
            const container = document.getElementById('messages-container');
            container.innerHTML = '';
            messages.forEach(msg => appendMessage(msg));
        }

        async function sendMessage() {
            const input = document.getElementById('message-input');
            const message = input.value.trim();
            if (!message || !currentClientID) return;
            const res = await authFetch('/api/send', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactID: currentClientID, message })
            });
            if (res.ok) input.value = '';
        }

        document.getElementById('send-btn').onclick = sendMessage;
        document.getElementById('message-input').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

        setInterval(fetchClients, 15000); // Background refresh
    </script>
</body>
</html>
`;
