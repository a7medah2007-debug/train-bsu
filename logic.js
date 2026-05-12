// logic.js - المنطق والأحداث والجدول الزمني (Babylon.js نسخة)
import { getCamera, getScene } from './scene.js';
import { reduceWalkers, startEvacuation, shiftTrainInteriors, setTrainDeparting } from './crowd.js'; // ✅ استيراد shiftTrainInteriors
import {
    getTicketModel, getWantSound, getEngineSound,
    getTrainSound, getConductorModel,
    openDoor, closeDoor, getDoorState, getAudioEngine,
    getTrainModel, getNoseySound
} from './models.js';
import { startConductorJourney } from './conductor.js';
import {
    EMPLOYEE, EMPLOYEE_DISTANCE_THRESHOLD,
    TICKET_PICKUP, TICKET_PICKUP_DISTANCE,
    TICKET_DELAY, ENGINE_DELAY, TRAIN_SOUND_DELAY,
    VIDEO_DURATION, TRAIN_STOP_TIME,
    ROOM_DOOR
} from './config.js';
import { openStationDoors, openTrainDoors } from './collision.js';

// 🔧 إصلاح: نقل endX و endZ هنا (كانت hardcoded في الكود الأصلي)
const END_POSITION = { x: 0.290, z: 0.171, threshold: 0.3 };

// ✅ إعدادات وصوت الخلفية المكاني
let noseySound = null;
const NOSEY_CONFIG = {
    centerX: 2.9,
    centerZ: -15.0,
    maxDistance: 80.0,
    refDistance: 2.0,
    volume: 0.8
};

// --- حالة الأحداث ---
let gameStarted = false;
let gameStartTime = 0;
let wantSoundPlayed = false;
let ticketCollectedTime = 0;
let walkersReduced = false;
let videoStartTime = 0;
let videoStopped = false;
let conductorStarted = false;
let endScreenShown = false;

// --- مراحل القصة ---
const PHASE = {
    APPROACH_EMPLOYEE: 1,
    TICKET_WAITING: 2,
    TICKET_VISIBLE: 3,
    TICKET_COLLECTED: 4,
    ENGINE_PLAYED: 5,
    TRAIN_PLAYING: 6,
    EVACUATING: 7
};
let currentPhase = PHASE.APPROACH_EMPLOYEE;
let ticketTimerStart = 0;

// --- أحداث القصة ---
let eventFlags = {
    conductorEntered: false,
    trainStopped: false,
    passengersExited: false,
    evacuationStarted: false
    // ✅ تم إزالة المتغير trainInteriorAgents من هنا (مكانه crowd.js)
};

// ========================
// 🚂 نظام مغادرة القطار (إذا لم يدخل اللاعب في 30 ثانية)
// ========================

// حدود منطقة القطار (X: 1.55~4.34, Z: -31.5~1.17)
const TRAIN_ZONE = {
    xMin: 1.55,
    xMax: 4.34,
    zMin: -31.5,
    zMax: 1.17
};

// إعدادات حركة القطار عند المغادرة
const TRAIN_DEPARTURE = {
    // مدة الانتظار بعد فتح الأبواب قبل تحرك القطار (بالثواني)
    waitSeconds: 120,
    // تسارع القطار (وحدة/ثانية²)
    acceleration: 0.08,
    // السرعة الابتدائية (وحدة/ثانية)
    initialSpeed: 0.5,
    // آخر نقطة من القطار في حالة السكون (Z الخلفي للقطار في config)
    // trainRightEdge.zMin = -31.536 → نستخدم -31.4 كما ذكر في المتطلبات
    trainRearZ: -31.4,
    // الموقع المستهدف لآخر نقطة من القطار (يعني القطار خرج بالكامل)
    trainRearTargetZ: 2.5
};

// متغيرات حالة نظام المغادرة
let departurePending = false;        // هل بدأ العد التنازلي؟
let departureStartTime = 0;          // وقت بدء العد التنازلي
let playerBoardedTrain = false;      // هل دخل اللاعب القطار؟
let trainDeparting = false;          // هل القطار في حالة تحرك؟
let trainDepartureSpeed = 0;         // السرعة الحالية للقطار أثناء التحرك
// مقدار الإزاحة الكلية المطلوبة لإخراج القطار
// من trainRearZ = -31.4 إلى trainRearTargetZ = 2.5 → إزاحة = 2.5 - (-31.4) = 33.9
const TRAIN_DEPARTURE_TOTAL_SHIFT = TRAIN_DEPARTURE.trainRearTargetZ - TRAIN_DEPARTURE.trainRearZ;
let trainDepartureShifted = 0;       // مجموع ما تحرك القطار حتى الآن

// ========================
// ✅ دالة آمنة لتشغيل الصوت (v2 API)
// ========================
// 🔒 لتتبع الأصوات اللي اتشغلت بالفعل (عشان كل صوت يتشغل مره واحده بس)
const playedSounds = new Set();

function safePlay(sound, name) {
    if (!sound) {
        console.warn(`⚠️ ${name}: الصوت مش متحمل (null)`);
        return;
    }

    // 🔒 لو الصوت ده اتشغل قبل كده، تجاهل
    if (playedSounds.has(name)) {
        console.log(`🔇 ${name} اتشغل قبل كده - متجاهل`);
        return;
    }

    try {
        const ae = getAudioEngine();
        const engineState = ae?.state;

        if (ae && engineState !== 'started' && engineState !== 'running') {
            console.log(`🔓 محاولة فتح AudioContext (state=${engineState}) قبل ${name}`);
            ae.unlockAsync().then(() => {
                console.log(`🔓✅ اتفتح، نشغل ${name}`);
                sound.play();
                playedSounds.add(name); // ✅ علّمه كمشغّل
            }).catch(err => console.warn(`⚠️ فشل فتح:`, err));
            return;
        }

        sound.play();
        playedSounds.add(name); // ✅ علّمه كمشغّل
        console.log(`🔊 ${name} (sound.state=${sound.state}, engine=${engineState})`);
    } catch(e) {
        console.warn(`⚠️ ${name}:`, e.message);
    }
}

// ========================
// ✅ دالة آمنة لإيقاف الصوت مع حذفه من playedSounds (يمكن إعادة تشغيله لاحقاً)
// ========================
function safeStop(sound, name) {
    if (!sound) {
        console.warn(`⚠️ ${name}: الصوت مش متحمل (null)`);
        return;
    }
    try {
        if (sound.state === 2) { // state 2 = Started في Babylon v2 API
            sound.stop();
            console.log(`🔇 ${name} اتوقف`);
        }
    } catch (e) {
        console.warn(`⚠️ فشل إيقاف ${name}:`, e.message);
    }
    // حذف من playedSounds حتى يمكن إعادة تشغيله لاحقاً
    playedSounds.delete(name);
}

// ========================
//  التهيئة
// ========================

function updateNoseySound(camera) {
    if (!noseySound || !camera) return;

    const dx = camera.position.x - NOSEY_CONFIG.centerX;
    const dz = camera.position.z - NOSEY_CONFIG.centerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const normalizedDist = Math.max(0, Math.min(1, dist / NOSEY_CONFIG.maxDistance));
    const volume = NOSEY_CONFIG.volume * (1 - normalizedDist);
    noseySound.setVolume(volume);
}

export function startGameLogic() {
    gameStarted = true;
    gameStartTime = performance.now();
    currentPhase = PHASE.APPROACH_EMPLOYEE;

    // ✅ تشغيل صوت الخلفية بعد تفاعل المستخدم بأمان
    noseySound = getNoseySound();
    if (noseySound) {
        const ae = getAudioEngine();
        
        // دالة التشغيل الآمنة
        const playNosey = () => {
            try {
                noseySound.play();
                console.log('🔊 nosey.mp3 شغال');
            } catch(e) {
                console.warn('⚠️ nosey.mp3:', e.message);
            }
        };

        if (ae && ae.state !== 'running') {
            ae.unlockAsync().then(() => {
                playNosey();
            }).catch(err => console.warn('⚠️ فشل unlock للـ nosey:', err));
        } else {
            playNosey();
        }
    }

    console.log('🚂 بدء أحداث القصة...');
}

// ========================
//  الحلقة الرئيسية
// ========================

/**
 * فحص المسافة من النقاط المهمة (الموظف، التذكرة، النهاية)
 */
export function checkDistance() {
    const camera = getCamera();
    if (!camera) return;

    const px = camera.position.x;
    const pz = camera.position.z;

    // 1. فحص الاقتراب من الموظف
    if (currentPhase === PHASE.APPROACH_EMPLOYEE) {
        const dx = px - EMPLOYEE.x;
        const dz = pz - EMPLOYEE.z;
        if (Math.sqrt(dx * dx + dz * dz) < EMPLOYEE_DISTANCE_THRESHOLD) {
            if (!wantSoundPlayed) {
                safePlay(getWantSound(), 'want.mp3');
                wantSoundPlayed = true;
            }
            currentPhase = PHASE.TICKET_WAITING;
            ticketTimerStart = performance.now();

            // إظهار رسالة الموظف
            showMessage('employee-message', 3000);

            console.log('👨‍💼 اقترب من الموظف! ⏱️ انتظار 7 ثواني...');
        }
    }

    // 2. انتظار 7 ثواني ثم إظهار التذكرة
    if (currentPhase === PHASE.TICKET_WAITING) {
        if (performance.now() - ticketTimerStart >= TICKET_DELAY) {
            const ticket = getTicketModel();
            if (ticket) {
                ticket.setEnabled(true);
                // تفعيل الـ children كمان
                if (ticket.getChildMeshes) {
                    ticket.getChildMeshes().forEach(m => m.setEnabled(true));
                }
            }
            currentPhase = PHASE.TICKET_VISIBLE;
            console.log(`🎫 التذكرة ظهرت! اذهب لإحداثيات X=${TICKET_PICKUP.x}, Z=${TICKET_PICKUP.z}`);
        }
    }

    // 3. فحص لمس التذكرة
    if (currentPhase === PHASE.TICKET_VISIBLE) {
        const dx = px - TICKET_PICKUP.x;
        const dz = pz - TICKET_PICKUP.z;
        if (Math.sqrt(dx * dx + dz * dz) < TICKET_PICKUP_DISTANCE) {
            const ticket = getTicketModel();
            if (ticket) {
                ticket.setEnabled(false);
                if (ticket.getChildMeshes) {
                    ticket.getChildMeshes().forEach(m => m.setEnabled(false));
                }
            }
            currentPhase = PHASE.TICKET_COLLECTED;
            ticketCollectedTime = performance.now();
            openStationDoors();

            // 🚂 بدء العد التنازلي لمغادرة القطار (30 ثانية)
            departurePending = true;
            departureStartTime = performance.now();
            console.log('⏱️ بدء العد التنازلي: 30 ثانية للدخول إلى القطار قبل مغادرته!');
            console.log('⏱️ بدء عد تنازلي: 15 ثانية لـ engine، 25 ثانية لـ train');
            console.log('🎫✅ التذكرة اتلمت واختفت!');
        }
    }

    // 4. فحص نهاية الرحلة
    if (!endScreenShown) {
        const edx = px - END_POSITION.x;
        const edz = pz - END_POSITION.z;
        if (Math.sqrt(edx * edx + edz * edz) < END_POSITION.threshold) {
            showEndScreen();
            endScreenShown = true;
        }
    }

    // 🚪 5. فحص الاقتراب من باب الغرفة (Object_14 + Object_15) - فتح تلقائي
    checkRoomDoorProximity(px, pz);

    // 🚂 6. فحص دخول اللاعب منطقة القطار (لإلغاء مؤقت المغادرة)
    checkPlayerInTrainZone(px, pz);
}

/**
 * 🚂 فحص إذا كان اللاعب داخل حدود القطار
 * الحدود: X: 1.55~4.34، Z: -31.5~1.17
 */
function checkPlayerInTrainZone(px, pz) {
    // نتحقق فقط لو العد التنازلي شغال ولم يدخل بعد ولم يغادر القطار
    if (!departurePending || playerBoardedTrain || trainDeparting) return;

    if (
        px >= TRAIN_ZONE.xMin && px <= TRAIN_ZONE.xMax &&
        pz >= TRAIN_ZONE.zMin && pz <= TRAIN_ZONE.zMax
    ) {
        // اللاعب دخل منطقة القطار → إلغاء مؤقت المغادرة
        playerBoardedTrain = true;
        departurePending = false;
        console.log('🚂✅ اللاعب دخل القطار! تم إلغاء مؤقت المغادرة - تستكمل أحداث القصة الطبيعية.');
    }
}

/**
 * 🚪 فحص الاقتراب من باب الغرفة وفتحه/قفله تلقائياً
 */
function checkRoomDoorProximity(px, pz) {
    const dx = px - ROOM_DOOR.centerX;
    const dz = pz - ROOM_DOOR.centerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const scene = getScene();
    if (!scene) return;

    const isOpen = getDoorState();

    // الاقتراب → فتح
    if (!isOpen && dist < ROOM_DOOR.autoOpenDistance) {
        openDoor(scene);
    }

    // الابتعاد → قفل (لو مفعل)
    if (ROOM_DOOR.autoCloseEnabled && isOpen && dist > ROOM_DOOR.autoCloseDistance) {
        closeDoor(scene);
    }
}

/**
 * إظهار رسالة من الـ DOM
 */
function showMessage(elementId, duration = 3000) {
    const msg = document.getElementById(elementId);
    if (msg) {
        msg.style.display = 'block';
        setTimeout(() => { msg.style.display = 'none'; }, duration);
    }
}

/**
 * إظهار شاشة النهاية
 */
function showEndScreen() {
    const endScreen = document.getElementById('end-screen');
    if (endScreen) {
        endScreen.style.display = 'flex';
        endScreen.style.opacity = '0';
        setTimeout(() => { endScreen.style.opacity = '1'; }, 100);
        console.log('🏁 شاشة النهاية ظهرت');
    }

    // ✅ إيقاف جميع الأصوات
    safeStop(getEngineSound(), 'engine.mp3');
    safeStop(getTrainSound(), 'train.mp3');
    safeStop(getWantSound(), 'want.mp3');
    safeStop(noseySound, 'nosey.mp3');
}

// ========================
//  الأحداث الزمنية
// ========================

export function updateTimedEvents(currentTime) {
    if (!gameStarted) return;
    const elapsed = (currentTime - gameStartTime) / 1000;

    // ✅ تحديث موقع الصوت المكاني كل فريم
    const camera = getCamera();
    if (camera && noseySound) {
        updateNoseySound(camera);
    }

    // --- أحداث ما بعد التذكرة ---
    if (currentPhase >= PHASE.TICKET_COLLECTED && ticketCollectedTime > 0) {
        const timeSinceCollected = currentTime - ticketCollectedTime;

        // 1. صوت المحرك بعد 15 ثانية (بغض النظر عن مكان اللاعب)
        if (timeSinceCollected >= ENGINE_DELAY && currentPhase === PHASE.TICKET_COLLECTED) {
            safePlay(getEngineSound(), 'engine.mp3');
            currentPhase = PHASE.ENGINE_PLAYED;
            console.log('🚂🔊 engine اشتغل!');
        }

        // 2. صوت القطر المستمر بعد 25 ثانية (بغض النظر عن مكان اللاعب)
        if (timeSinceCollected >= TRAIN_SOUND_DELAY && currentPhase === PHASE.ENGINE_PLAYED) {
            safePlay(getTrainSound(), 'train.mp3');
            currentPhase = PHASE.TRAIN_PLAYING;

            if (playerBoardedTrain) {
                // اللاعب ركب → تشغيل جميع العناصر المصاحبة
                if (!walkersReduced) {
                    reduceWalkers();
                    walkersReduced = true;
                }

                // تشغيل فيديو الشبابيك
                import('./scene.js').then(m => {
                    m.playWindowVideo();
                    console.log('🎥 فيديو الشبابيك بدأ!');
                });
                videoStartTime = currentTime;

                // بدء رحلة الكمسري
                if (!conductorStarted) {
                    const conductorMesh = getConductorModel();
                    if (conductorMesh) {
                        startConductorJourney(conductorMesh);
                        conductorStarted = true;
                    }
                }

                console.log('🚆🔊 train شغال - اللاعب ركب → فيديو + كمسري + مشاة!');
            } else {
                // اللاعب لم يركب → صوت القطار فقط بدون فيديو أو كمسري
                console.log('🚆🔊 train شغال - اللاعب لم يركب → بدون فيديو أو كمسري!');
            }
        }
    }

    // --- إيقاف الفيديو بعد المدة المحددة ---
    if (videoStartTime > 0 && !videoStopped) {
        if (currentTime - videoStartTime >= VIDEO_DURATION) {
            import('./scene.js').then(m => m.stopWindowVideo());
            videoStopped = true;
            console.log('🎥⏹️ المدة خلصت - فيديو الشبابيك توقف');
        }
    }

    // --- أحداث زمنية ---

    // 1. الكمسري بعد 40 ثانية (للـ logging فقط)
    if (elapsed >= 40 && !eventFlags.conductorEntered) {
        eventFlags.conductorEntered = true;
        console.log('🎩 40 ثانية: الكمسري يدخل!');
    }

    // 2. القطار يقف بعد TRAIN_STOP_TIME (229 ثانية ≈ 3:49)
    if (elapsed >= TRAIN_STOP_TIME && !eventFlags.trainStopped) {
        eventFlags.trainStopped = true;
        openTrainDoors();

        // إيقاف train.mp3 (v2: state===2 يعني Started)
        const trainSnd = getTrainSound();
        if (trainSnd && trainSnd.state === 2) {
            try {
                trainSnd.stop();
            } catch (e) {
                console.warn('⚠️ مش قادر يوقف train sound');
            }
        }

        // إيقاف الفيديو
        import('./scene.js').then(m => m.stopWindowVideo());
        videoStopped = true;
        console.log('🚂 القطار توقف!');
    }

    // 3. بدء الإخلاء بعد إيقاف القطار
    if (eventFlags.trainStopped && !eventFlags.evacuationStarted) {
        eventFlags.evacuationStarted = true;
        startEvacuation();
        currentPhase = PHASE.EVACUATING;
        console.log('🚶‍♂️🚶‍♀️ الناس بدأت تنزل من القطار!');
    }

    // 🚂 --- منطق مغادرة القطار (إذا لم يدخل اللاعب في 30 ثانية) ---
    updateTrainDeparture(currentTime);
}

// ========================
// 🚂 تحديث حركة مغادرة القطار
// ========================

/**
 * يُستدعى كل فريم من updateTimedEvents.
 * المراحل:
 *   1. departurePending=true & !trainDeparting → ننتظر 30 ثانية
 *   2. انتهت الـ30 ثانية ولم يدخل اللاعب → نبدأ تحرك القطار
 *   3. trainDeparting=true → نحرك القطار كل فريم بتسارع تدريجي
 *   4. لما يكمّل الإزاحة المطلوبة → شاشة النهاية
 */
function updateTrainDeparture(currentTime) {
    // لو اللاعب دخل القطار أو شاشة النهاية ظهرت → لا شيء
    if (playerBoardedTrain || endScreenShown) return;

    // --- المرحلة 1: انتظار انتهاء العد التنازلي ---
    if (departurePending && !trainDeparting) {
        const elapsed30 = (currentTime - departureStartTime) / 1000;
        if (elapsed30 >= TRAIN_DEPARTURE.waitSeconds) {
            // انتهت الـ30 ثانية ولم يدخل اللاعب → ابدأ تحريك القطار
            departurePending = false;
            trainDeparting = true;
            trainDepartureSpeed = TRAIN_DEPARTURE.initialSpeed;
            trainDepartureShifted = 0;
            setTrainDeparting(true);

            // 🔊 إيقاف أصوات القطار كإشارة واقعية لمغادرة القطار المحطة
            safeStop(getEngineSound(), 'engine.mp3');
            safeStop(getTrainSound(), 'train.mp3');

            console.log('🚂💨 انتهى الوقت! القطار يغادر...');
        }
        return;
    }

    // --- المرحلة 2: تحريك القطار ---
    if (!trainDeparting) return;

    const scene = getScene();
    if (!scene) return;

    const trainMesh = getTrainModel();
    if (!trainMesh) {
        console.warn('⚠️ trainModel مش موجود - مش قادر يتحرك');
        return;
    }

    // حساب الـ delta بالثواني من الـ engine
    const engine = scene.getEngine();
    const delta = engine ? engine.getDeltaTime() / 1000 : 0.016;

    // تسارع السرعة تدريجياً
    trainDepartureSpeed += TRAIN_DEPARTURE.acceleration * delta;

    // مقدار الحركة في هذا الفريم
    const moveAmount = trainDepartureSpeed * delta;
    trainDepartureShifted += moveAmount;

    // تحريك القطار نحو +Z
    trainMesh.position.z += moveAmount;

    // ✅ تحريك الركاب داخل القطار بنفس المقدار (الدالة مستوردة من crowd.js)
    shiftTrainInteriors(moveAmount);

    // فحص الوصول للهدف (آخر نقطة من القطار عند Z=2.5)
    if (trainDepartureShifted >= TRAIN_DEPARTURE_TOTAL_SHIFT) {
        // نضمن الموقع بالظبط
        trainMesh.position.z += (TRAIN_DEPARTURE_TOTAL_SHIFT - trainDepartureShifted);
        trainDeparting = false;
        console.log('🚂✅ القطار غادر المحطة!');

        // إظهار شاشة النهاية
        if (!endScreenShown) {
            showEndScreen();
            endScreenShown = true;
        }
    }
}

// ========================
//  دوال مساعدة
// ========================

export function resetLogic() {
    gameStarted = false;
    gameStartTime = 0;
    currentPhase = PHASE.APPROACH_EMPLOYEE;
    ticketTimerStart = 0;
    wantSoundPlayed = false;
    ticketCollectedTime = 0;
    walkersReduced = false;
    videoStartTime = 0;
    videoStopped = false;
    conductorStarted = false;
    endScreenShown = false;
    eventFlags = {
        conductorEntered: false,
        trainStopped: false,
        passengersExited: false,
        evacuationStarted: false
    };

    // 🚂 إعادة تعيين متغيرات المغادرة
    departurePending = false;
    departureStartTime = 0;
    playerBoardedTrain = false;
    trainDeparting = false;
    trainDepartureSpeed = 0;
    trainDepartureShifted = 0;
}

export function getEventFlags() { return eventFlags; }
export function getCurrentPhase() { return currentPhase; }
