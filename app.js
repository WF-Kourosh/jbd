// =============================================
// CONFIG: Toggle features on/off
// =============================================
var SHOW_REPLAY_BUTTON = false; // Set to true to show the replay button after blowout

// =============================================
// STATE
// =============================================
var audioContext;
var analyser;
var microphone;
var isBlownOut = false;
var isHoldingBase = false;
var blowGracePeriod = false;
var dataArray;
var bufferLength;
var audioStream;
var blowThreshold = 80; // Default, will be calibrated
var calibrationSamples = [];
var isCalibrating = false;
var micDeniedCount = 0;
var touchMode = false;
var flamesExtinguished = 0;

// =============================================
// DOM REFERENCES
// =============================================
var audioLoop = document.getElementById('audio-loop');
var audioBlow = document.getElementById('audio-blow');

// =============================================
// VISUAL EFFECTS — Glowing Orbs
// =============================================

// Spawns beautiful glowing orbs that drift upwards
function releaseLightOrbs() {
    var colors = ['rgba(64, 224, 208, 0.6)', 'rgba(255, 223, 112, 0.6)', 'rgba(255, 255, 255, 0.4)'];
    for (var i = 0; i < 60; i++) {
        var orb = document.createElement('div');
        orb.classList.add('orb');

        orb.style.left = (Math.random() * 100) + 'vw';
        orb.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

        // Randomize sizes from tiny specs to larger blurs
        var size = (Math.random() * 15 + 5) + 'px';
        orb.style.width = size;
        orb.style.height = size;

        // Slow, graceful floating animation
        orb.style.animationDuration = (Math.random() * 4 + 4) + 's';
        orb.style.animationDelay = (Math.random() * 2) + 's';

        // Add a gentle horizontal drift
        orb.style.transform = 'translateX(' + ((Math.random() - 0.5) * 50) + 'px)';

        document.body.appendChild(orb);
        setTimeout(function (el) { return function () { el.remove(); }; }(orb), 9000);
    }
}

// =============================================
// MICROPHONE — Calibration & Blow Detection
// =============================================

// --- Adaptive Calibration ---
function calibrateAmbientNoise() {
    if (!isCalibrating || !analyser) return;

    analyser.getByteFrequencyData(dataArray);
    var sum = 0;
    for (var i = 0; i < bufferLength / 2; i++) {
        sum += dataArray[i];
    }
    var average = sum / (bufferLength / 2);
    calibrationSamples.push(average);

    requestAnimationFrame(calibrateAmbientNoise);
}

function finalizeCalibration() {
    isCalibrating = false;
    if (calibrationSamples.length === 0) {
        blowThreshold = 80; // Fallback
        return;
    }
    var total = 0;
    for (var i = 0; i < calibrationSamples.length; i++) {
        total += calibrationSamples[i];
    }
    var ambientAverage = total / calibrationSamples.length;
    // Set threshold: ambient × 4, clamped between 50 and 150
    blowThreshold = Math.min(150, Math.max(50, ambientAverage * 4));
    calibrationSamples = [];
}

// --- Blow detection using adaptive threshold ---
function detectBlow() {
    if (isBlownOut || !isHoldingBase) return;

    analyser.getByteFrequencyData(dataArray);
    var sum = 0;
    for (var i = 0; i < bufferLength / 2; i++) {
        sum += dataArray[i];
    }
    var average = sum / (bufferLength / 2);

    var container = document.getElementById('candle-container');
    // Flame-flicker zone: between ambient+5 and threshold
    var flickerFloor = Math.max(10, blowThreshold * 0.15);

    if (average > flickerFloor && average < blowThreshold) {
        var intensity = (average - flickerFloor) / (blowThreshold - flickerFloor);
        container.style.setProperty('--blow-scale', Math.max(0.3, 1 - (intensity * 0.7)));
        container.style.setProperty('--blow-skew', (intensity * -60) + 'deg');
        container.style.setProperty('--blow-x', (intensity * -25) + 'px');
    } else if (average <= flickerFloor) {
        container.style.setProperty('--blow-scale', '1');
        container.style.setProperty('--blow-skew', '0deg');
        container.style.setProperty('--blow-x', '0px');
    }

    if (average >= blowThreshold && !blowGracePeriod) {
        blowOutCandles();

        // Clean up mic
        try {
            audioStream.getTracks().forEach(function (track) { track.stop(); });
            if (audioContext.state !== 'closed') audioContext.close();
        } catch (e) { /* ignore cleanup errors */ }
    } else {
        requestAnimationFrame(detectBlow);
    }
}

// =============================================
// CANDLE BLOWOUT — Shared sequence
// =============================================

function blowOutCandles() {
    if (isBlownOut) return;
    isBlownOut = true;

    document.getElementById('num-left').classList.remove('lit');
    document.getElementById('num-left').classList.add('blown-out');

    document.getElementById('num-right').classList.remove('lit');
    document.getElementById('num-right').classList.add('blown-out');

    document.getElementById('candle-container').classList.remove('ready');

    // Minimalist reveal message
    var msg = document.getElementById('message');
    msg.className = '';
    msg.innerText = "Happy 33rd, Jasmin";
    // Trigger the smooth birthday reveal animation
    void msg.offsetWidth; // force reflow
    msg.classList.add('birthday-reveal');

    releaseLightOrbs();

    // Stop the looping "ha" audio and play "ppy birthday"
    audioLoop.pause();
    audioLoop.currentTime = 0;
    audioBlow.play().catch(function () { });

    // Hide volume hint
    document.getElementById('volume-hint').classList.remove('visible');

    // Show replay button after a generous moment (if enabled)
    if (SHOW_REPLAY_BUTTON) {
        setTimeout(function () {
            var replayBtn = document.getElementById('replay-btn');
            replayBtn.style.display = 'inline-block';
            void replayBtn.offsetWidth;
            replayBtn.classList.add('visible');
        }, 15000);
    }
}

// =============================================
// CANDLE BASE — Hold-to-blow interaction
// =============================================

var candleBase = document.getElementById('candle-base');

function startHolding(e) {
    e.preventDefault();
    if (!isBlownOut && document.getElementById('candle-container').classList.contains('ready')) {
        isHoldingBase = true;
        audioLoop.volume = 0.25;
        blowGracePeriod = true;
        setTimeout(function () { blowGracePeriod = false; }, 750);
        var msg = document.getElementById('message');
        msg.innerText = "Breathe Out";
        msg.classList.add('visible');
        detectBlow();
    }
}

function stopHolding(e) {
    // Only preventDefault if we were actually holding the candle base
    if (isHoldingBase && !isBlownOut) {
        e.preventDefault();
        isHoldingBase = false;
        audioLoop.volume = 1.0;
        var msg = document.getElementById('message');
        msg.innerText = "Make A Wish";
        msg.classList.add('visible');
        var container = document.getElementById('candle-container');
        container.style.setProperty('--blow-scale', '1');
        container.style.setProperty('--blow-skew', '0deg');
        container.style.setProperty('--blow-x', '0px');
    }
}

candleBase.addEventListener('mousedown', startHolding);
window.addEventListener('mouseup', stopHolding);
candleBase.addEventListener('touchstart', startHolding, { passive: false });
window.addEventListener('touchend', stopHolding);

// =============================================
// UI — Error Display
// =============================================

function showError(text, wasDenied) {
    var startBtn = document.getElementById('start-btn');
    startBtn.style.display = 'none';

    var errorEl = document.getElementById('error-msg');

    // If mic was denied more than once, the browser (Firefox) has cached
    // the denial and won't re-prompt — offer touch fallback.
    if (wasDenied && micDeniedCount > 1) {
        errorEl.innerHTML = text +
            '<br>You can still blow out the candles!' +
            '<br><span class="retry-link" id="touch-fallback-link">Use Touch Instead</span>';
        errorEl.classList.add('visible');
        var touchLink = document.getElementById('touch-fallback-link');
        function startTouchFallback(e) {
            e.preventDefault();
            hideError();
            igniteTouchMode();
        }
        touchLink.addEventListener('click', startTouchFallback);
        touchLink.addEventListener('touchend', startTouchFallback);
    } else {
        errorEl.innerHTML = text + '<br><span class="retry-link" id="retry-link">Try Again</span>';
        errorEl.classList.add('visible');
        var retryLink = document.getElementById('retry-link');
        retryLink.addEventListener('click', function (e) {
            e.preventDefault();
            hideError();
            ignite(document.getElementById('start-btn'));
        });
        retryLink.addEventListener('touchend', function (e) {
            e.preventDefault();
            hideError();
            ignite(document.getElementById('start-btn'));
        });
    }
}

function hideError() {
    var errorEl = document.getElementById('error-msg');
    errorEl.classList.remove('visible');
    errorEl.innerHTML = '';
    var startBtn = document.getElementById('start-btn');
    startBtn.style.display = '';
    startBtn.style.visibility = 'visible';
    startBtn.style.pointerEvents = 'auto';
    startBtn.style.opacity = '1';
    startBtn.innerText = 'Ignite';
    startBtn.dataset.igniting = 'false';
}

// =============================================
// RESET — Replay the entire experience
// =============================================

function resetExperience() {
    // Stop any playing audio
    audioLoop.pause();
    audioLoop.currentTime = 0;
    audioBlow.pause();
    audioBlow.currentTime = 0;

    // Clean up mic/audio context if still open
    try {
        if (audioStream) audioStream.getTracks().forEach(function (track) { track.stop(); });
        if (audioContext && audioContext.state !== 'closed') audioContext.close();
    } catch (e) { /* ignore */ }

    // Reset state
    audioContext = null;
    analyser = null;
    microphone = null;
    isBlownOut = false;
    isHoldingBase = false;
    blowGracePeriod = false;
    dataArray = null;
    bufferLength = 0;
    audioStream = null;
    blowThreshold = 80;
    calibrationSamples = [];
    isCalibrating = false;
    touchMode = false;
    flamesExtinguished = 0;
    document.getElementById('candle-container').classList.remove('touch-mode');

    // Reset candle DOM
    var numLeft = document.getElementById('num-left');
    var numRight = document.getElementById('num-right');
    numLeft.classList.remove('lit', 'blown-out');
    numRight.classList.remove('lit', 'blown-out');

    // Clear touched class from flames
    var allFlames = document.querySelectorAll('.flame');
    for (var i = 0; i < allFlames.length; i++) {
        allFlames[i].classList.remove('touched');
    }

    // Hide touch hint
    var touchHint = document.getElementById('touch-hint');
    if (touchHint) touchHint.classList.remove('visible');

    var container = document.getElementById('candle-container');
    container.classList.remove('ready');
    container.style.setProperty('--blow-scale', '1');
    container.style.setProperty('--blow-skew', '0deg');
    container.style.setProperty('--blow-x', '0px');

    // Reset match animation
    var match = document.getElementById('match');
    match.classList.remove('animate-match');

    // Reset message
    var msg = document.getElementById('message');
    msg.className = '';
    msg.innerText = '';

    // Hide replay button
    var replayBtn = document.getElementById('replay-btn');
    replayBtn.classList.remove('visible');
    replayBtn.style.display = 'none';

    // Hide volume hint
    document.getElementById('volume-hint').classList.remove('visible');

    // Remove any leftover orbs
    var orbs = document.querySelectorAll('.orb');
    for (var i = 0; i < orbs.length; i++) {
        orbs[i].remove();
    }

    // Show ignite button again
    var startBtn = document.getElementById('start-btn');
    startBtn.style.visibility = 'visible';
    startBtn.style.pointerEvents = 'auto';
    startBtn.style.display = '';
    startBtn.innerText = 'Ignite';
    startBtn.style.opacity = '1';
    startBtn.dataset.igniting = 'false';
}

// =============================================
// IGNITE — Main sequence (mic mode)
// =============================================

async function ignite(btn) {
    // Prevent double-tap
    if (btn.dataset.igniting === 'true') return;
    btn.dataset.igniting = 'true';

    btn.innerText = "Lighting...";
    btn.style.opacity = "0.5";

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Microphone not available — please use HTTPS.");
        }

        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // iOS Safari requires an explicit resume within a user gesture
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(audioStream);

        microphone.connect(analyser);
        analyser.fftSize = 512;

        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        btn.style.visibility = 'hidden';
        btn.style.pointerEvents = 'none';
        var msg = document.getElementById('message');
        msg.innerText = "";
        msg.classList.remove('visible', 'birthday-reveal');

        // Show volume hint
        document.getElementById('volume-hint').classList.add('visible');

        // Start ambient noise calibration during match animation
        isCalibrating = true;
        calibrationSamples = [];
        calibrateAmbientNoise();

        var match = document.getElementById('match');
        match.classList.add('animate-match');

        // The sweeping animation is slightly slower now, so the timings are adjusted
        setTimeout(function () { document.getElementById('num-right').classList.add('lit'); }, 1400);
        setTimeout(function () { document.getElementById('num-left').classList.add('lit'); }, 1900);

        // Start the looping "ha" audio once both candles are lit
        setTimeout(function () {
            audioLoop.play().catch(function () { });
        }, 1900);

        // Finalize calibration and enable interaction
        setTimeout(function () {
            finalizeCalibration();
            document.getElementById('candle-container').classList.add('ready');
            var msg = document.getElementById('message');
            msg.innerText = "Make A Wish";
            msg.classList.add('visible');
        }, 3000);

    } catch (err) {
        console.error(err);
        var errorText = 'Microphone access is needed to blow out the candles';
        var wasDenied = false;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorText = 'Microphone permission was denied — please allow access';
            micDeniedCount++;
            wasDenied = true;
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            errorText = 'No microphone found on this device';
        } else if (err.message) {
            errorText = err.message;
        }
        showError(errorText, wasDenied);
        btn.dataset.igniting = 'false';
    }
}

// =============================================
// BUTTON EVENT LISTENERS
// =============================================

var startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', function (e) {
    ignite(this);
});
// Ensure it also works on mobile via touchend in case click is not synthesized
startBtn.addEventListener('touchend', function (e) {
    e.preventDefault();
    ignite(this);
});

// --- Replay button handlers ---
var replayBtn = document.getElementById('replay-btn');
replayBtn.addEventListener('click', function (e) {
    resetExperience();
});
replayBtn.addEventListener('touchend', function (e) {
    e.preventDefault();
    resetExperience();
});

// =============================================
// TOUCH MODE — Fallback without microphone
// =============================================

function igniteTouchMode() {
    touchMode = true;
    flamesExtinguished = 0;
    isBlownOut = false;

    var startBtn = document.getElementById('start-btn');
    startBtn.style.visibility = 'hidden';
    startBtn.style.pointerEvents = 'none';

    var msg = document.getElementById('message');
    msg.innerText = '';
    msg.classList.remove('visible', 'birthday-reveal');

    // Show volume hint
    document.getElementById('volume-hint').classList.add('visible');

    var match = document.getElementById('match');
    match.classList.add('animate-match');

    setTimeout(function () { document.getElementById('num-right').classList.add('lit'); }, 1400);
    setTimeout(function () { document.getElementById('num-left').classList.add('lit'); }, 1900);

    setTimeout(function () {
        audioLoop.play().catch(function () { });
    }, 1900);

    setTimeout(function () {
        document.getElementById('candle-container').classList.add('ready');
        document.getElementById('candle-container').classList.add('touch-mode');
        var msg = document.getElementById('message');
        msg.innerText = 'Make A Wish';
        msg.classList.add('visible');
        // Show subtle hint below candles
        var hint = document.getElementById('touch-hint');
        hint.classList.add('visible');
        enableTouchBlowout();
    }, 3000);
}

function enableTouchBlowout() {
    var flames = document.querySelectorAll('.flame');
    var numbersWrapper = document.querySelector('.numbers-wrapper');

    // Track which candles have been touched
    var candleTouched = { left: false, right: false };

    function extinguishFlame(candle, side) {
        if (candleTouched[side] || isBlownOut) return;
        candleTouched[side] = true;
        flamesExtinguished++;

        // Find the flame in this candle and add touched class for shrink animation
        var flame = candle.querySelector('.flame');
        if (flame) flame.classList.add('touched');

        // After shrink, blow out (don't remove 'touched' — blown-out overrides it)
        setTimeout(function () {
            candle.classList.remove('lit');
            candle.classList.add('blown-out');

            // If both flames are out, trigger birthday reveal
            if (flamesExtinguished >= 2) {
                // Hide the touch hint
                var hint = document.getElementById('touch-hint');
                if (hint) hint.classList.remove('visible');
                blowOutCandles();
            }
        }, 400);
    }

    // --- Touch events (mobile swipe) ---
    function handleTouchMove(e) {
        if (isBlownOut) return;
        var touches = e.touches || e.changedTouches;
        for (var t = 0; t < touches.length; t++) {
            var touch = touches[t];
            var el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!el) continue;
            var candle = el.closest('.number-candle');
            if (candle && candle.classList.contains('lit')) {
                var side = candle.id === 'num-left' ? 'left' : 'right';
                extinguishFlame(candle, side);
            }
        }
    }

    // --- Mouse events (desktop click-drag) ---
    var isDragging = false;

    function handleMouseDown(e) {
        if (isBlownOut) return;
        e.preventDefault(); // Prevent text selection while dragging
        isDragging = true;
        checkMouseTarget(e);
    }

    function handleMouseMove(e) {
        if (!isDragging || isBlownOut) return;
        checkMouseTarget(e);
    }

    function handleMouseUp() {
        isDragging = false;
    }

    function checkMouseTarget(e) {
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el) return;
        var candle = el.closest('.number-candle');
        if (candle && candle.classList.contains('lit')) {
            var side = candle.id === 'num-left' ? 'left' : 'right';
            extinguishFlame(candle, side);
        }
    }

    numbersWrapper.addEventListener('touchmove', handleTouchMove, { passive: true });
    numbersWrapper.addEventListener('touchstart', handleTouchMove, { passive: true });
    numbersWrapper.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
}
