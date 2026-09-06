// --- Supabase Setup ---
const SUPABASE_URL = "https://dyifdwlxzevrjvpzezry.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5aWZkd2x4emV2cmp2cHplenJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NDc1NzYsImV4cCI6MjEwNDIyMzU3Nn0.ukQj4tZnOUTfuUN2pDFMnlbr5AC_2-wEmMd_iyh3uwg";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Game State ---
const BOARD_SIZE = 7;
let roomChannel = null;
let myPlayerSymbol = null; // 'P1' or 'P2'
let isMyTurn = false;
let currentPath = []; // Current turn step moves

let gameState = {
    board: Array(BOARD_SIZE * BOARD_SIZE).fill(null),
    turn: 'P1',
    p1Head: 0,                   // Top-left
    p2Head: BOARD_SIZE * BOARD_SIZE - 1, // Bottom-right
    scores: { P1: 1, P2: 1 }
};

// --- DOM Elements ---
const lobbyEl = document.getElementById('lobby');
const gameContainerEl = document.getElementById('game-container');
const boardEl = document.getElementById('board');
const joinBtn = document.getElementById('join-btn');
const roomIdInput = document.getElementById('room-id');
const statusMsg = document.getElementById('status-msg');
const turnDisplay = document.getElementById('turn-display');
const endTurnBtn = document.getElementById('end-turn-btn');

// --- Initialize Board UI ---
function createBoardUI() {
    boardEl.innerHTML = '';
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;
        cell.addEventListener('click', () => handleCellClick(i));
        boardEl.appendChild(cell);
    }
}

// --- Multiplayer Connection ---
joinBtn.addEventListener('click', async () => {
    const roomId = roomIdInput.value.trim();
    if (!roomId) return alert("Please enter a room code.");

    statusMsg.innerText = "Connecting to room...";
    joinBtn.disabled = true;

    roomChannel = supabase.channel(`room_${roomId}`, {
        config: { broadcast: { self: true } }
    });

    roomChannel
        .on('broadcast', { event: 'state_update' }, ({ payload }) => {
            gameState = payload.state;
            updateUI();
        })
        .on('presence', { event: 'sync' }, () => {
            const state = roomChannel.presenceState();
            const players = Object.keys(state);
            
            if (!myPlayerSymbol) {
                myPlayerSymbol = players.length === 1 ? 'P1' : 'P2';
            }
            
            statusMsg.innerText = `Connected as ${myPlayerSymbol}. Waiting for opponent...`;
            
            if (players.length >= 2) {
                lobbyEl.classList.add('hidden');
                gameContainerEl.classList.remove('hidden');
                initGame();
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await roomChannel.track({ online_at: new Date().toISOString() });
            }
        });
});

function initGame() {
    if (myPlayerSymbol === 'P1') {
        gameState.board[0] = 'P1_BASE';
        gameState.board[BOARD_SIZE * BOARD_SIZE - 1] = 'P2_BASE';
        broadcastState();
    }
    createBoardUI();
    updateUI();
}

function broadcastState() {
    if (roomChannel) {
        roomChannel.send({
            type: 'broadcast',
            event: 'state_update',
            payload: { state: gameState }
        });
    }
}

// --- Game Logic ---
function handleCellClick(index) {
    if (!isMyTurn) return;
    
    const currentHead = myPlayerSymbol === 'P1' ? gameState.p1Head : gameState.p2Head;
    const validMoves = getValidMoves(currentHead);

    if (validMoves.includes(index) && currentPath.length < 3) {
        gameState.board[index] = `${myPlayerSymbol}_LINE`;
        if (myPlayerSymbol === 'P1') gameState.p1Head = index;
        else gameState.p2Head = index;

        currentPath.push(index);
        endTurnBtn.disabled = false;
        
        broadcastState();
    }
}

function getValidMoves(headIndex) {
    const moves = [];
    const row = Math.floor(headIndex / BOARD_SIZE);
    const col = headIndex % BOARD_SIZE;

    const dirs = [[-1,0], [1,0], [0,-1], [0,1]]; // Up, Down, Left, Right
    for (let [dr, dc] of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
            const idx = nr * BOARD_SIZE + nc;
            if (gameState.board[idx] === null) {
                moves.push(idx);
            }
        }
    }
    return moves;
}

endTurnBtn.addEventListener('click', () => {
    if (!isMyTurn || currentPath.length === 0) return;

    // Switch Turn
    gameState.turn = gameState.turn === 'P1' ? 'P2' : 'P1';
    currentPath = [];
    endTurnBtn.disabled = true;

    broadcastState();
});

// --- Render & UI Update ---
function updateUI() {
    isMyTurn = (gameState.turn === myPlayerSymbol);
    turnDisplay.innerText = isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN";
    turnDisplay.style.color = gameState.turn === 'P1' ? 'var(--p1-color)' : 'var(--p2-color)';

    const cells = document.querySelectorAll('.cell');
    const currentHead = myPlayerSymbol === 'P1' ? gameState.p1Head : gameState.p2Head;
    const validMoves = isMyTurn && currentPath.length < 3 ? getValidMoves(currentHead) : [];

    cells.forEach((cell, idx) => {
        cell.className = 'cell'; // Reset classes
        const val = gameState.board[idx];

        if (val) {
            if (val === 'P1_BASE') cell.classList.add('p1-base');
            else if (val === 'P2_BASE') cell.classList.add('p2-base');
            else if (val === 'P1_LINE') cell.classList.add('p1-line');
            else if (val === 'P2_LINE') cell.classList.add('p2-line');
            else if (val === 'P1_SHADOW') cell.classList.add('p1-shadow');
            else if (val === 'P2_SHADOW') cell.classList.add('p2-shadow');
        }

        if (validMoves.includes(idx)) {
            cell.classList.add('selectable');
        }
    });

    // Update Scores
    let p1Count = 0, p2Count = 0;
    gameState.board.forEach(v => {
        if (v && v.startsWith('P1')) p1Count++;
        if (v && v.startsWith('P2')) p2Count++;
    });
    document.getElementById('score-p1').innerText = p1Count;
    document.getElementById('score-p2').innerText = p2Count;
}
