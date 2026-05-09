// conductor.js - إدارة الكمسري وحركته والتفاعل مع التذاكر (Babylon.js نسخة)
import { CONDUCTOR, MODELS } from './config.js';
import { getTicketSound, getModel } from './models.js';
import { getCamera, getScene } from './scene.js';

let conductorMesh = null;
let conductorState = 'idle'; // idle | walking | waiting | facing_player | done
let currentStopIndex = 0;
let waitTimer = 0;
let ticketSoundPlayed = false;
let playerTicketVisible = false;
let playerTicketMesh = null;

// ========================
//  التهيئة
// ========================

/**
 * بدء رحلة الكمسري
 * @param {BABYLON.AbstractMesh} mesh - موديل الكمسري
 */
export function startConductorJourney(mesh) {
    conductorMesh = mesh;

    // تعيين موقع البداية
    conductorMesh.position.x = CONDUCTOR.startX;
    conductorMesh.position.y = 0;
    conductorMesh.position.z = CONDUCTOR.startZ;
    conductorMesh.rotation.y = 0; // يبص لـ +Z

    conductorState = 'walking';
    currentStopIndex = 0;
    waitTimer = 0;
    ticketSoundPlayed = false;
    playerTicketVisible = false;

    console.log('🎩 الكمسري بدأ رحلته من Z =', CONDUCTOR.startZ);
}

// ========================
//  التحديث كل فريم
// ========================

/**
 * تحديث حركة الكمسري
 * @param {number} delta - الوقت المنقضي بالثواني
 */
export function updateConductor(delta) {
    if (!conductorMesh || conductorState === 'done') return;

    const currentZ = conductorMesh.position.z;

    switch (conductorState) {
        case 'walking':
            updateWalking(delta, currentZ);
            break;

        case 'waiting':
            updateWaiting(delta);
            break;

        case 'facing_player':
            updateFacingPlayer(delta);
            break;
    }
}

// ========================
//  المشي بين الكراسي
// ========================

function updateWalking(delta, currentZ) {
    const stops = CONDUCTOR.seatZStops;
    // ✅ استخدم delta عشان السرعة تبقى بالمتر/الثانية مش بالمتر/الفريم
    //    في 60fps: walkSpeed=0.16 كانت بتطلع 9.6 متر/ثانية (آنياً)
    //    دلوقتي 0.16 = 0.16 متر/ثانية فقط (مشي طبيعي)
    //    نضرب × 8 عشان تتناسب مع العالم الكبير = 1.28 متر/ثانية
    const speed = CONDUCTOR.walkSpeed * delta * 8;
    // مسافة الوصول = أكبر من السرعة + buffer
    const arrivalThreshold = Math.max(speed * 1.5, 0.3);

    if (currentStopIndex < stops.length) {
        const targetZ = stops[currentStopIndex];

        if (Math.abs(currentZ - targetZ) < arrivalThreshold) {
            // وصل للكرسي - قف
            conductorMesh.position.z = targetZ;
            conductorState = 'waiting';
            waitTimer = CONDUCTOR.stopDuration / 1000; // تحويل لثواني
            lookAtPassengers(targetZ);
            console.log(`🎩 الكمسري وصل للكرسي ${currentStopIndex + 1}, Z = ${targetZ}`);
        } else {
            // لسه ماشي
            if (currentZ < targetZ) {
                conductorMesh.position.z += speed;
                conductorMesh.rotation.y = 0; // يبص قدام (+Z)
            } else {
                conductorMesh.position.z -= speed;
                conductorMesh.rotation.y = Math.PI; // يبص ورا (-Z)
            }
        }
    } else {
        // خلص كل الكراسي - اتجه للاعب
        checkPlayerProximity(currentZ, speed);
    }
}

// ========================
//  الانتظار عند الكرسي
// ========================

function updateWaiting(delta) {
    waitTimer -= delta;

    if (waitTimer <= 0) {
        currentStopIndex++;
        conductorState = 'walking';
        console.log(`🎩 الكمسري تحرك من الكرسي ${currentStopIndex}`);
    }
}

// ========================
//  التوجه للاعب
// ========================

function checkPlayerProximity(currentZ, speed) {
    const camera = getCamera();
    if (!camera) return;

    const playerZ = camera.position.z;
    const distance = Math.abs(currentZ - playerZ);

    if (distance < 2.4) {
        // وصل للاعب - قف وابص عليه
        conductorMesh.position.z = playerZ;
        conductorState = 'facing_player';
        waitTimer = CONDUCTOR.ticketWaitDuration / 1000;
        lookAtPlayer();
        playTicketSound();

        // إظهار رسالة الكمسري
        const msg = document.getElementById('conductor-message');
        if (msg) {
            msg.style.display = 'block';
            setTimeout(() => { msg.style.display = 'none'; }, 3000);
        }

        console.log('🎩🎫 الكمسري قدام اللاعب!');
    } else {
        // لسه ماشي للاعب
        if (currentZ < playerZ) {
            conductorMesh.position.z += speed;
            conductorMesh.rotation.y = 0;
        } else {
            conductorMesh.position.z -= speed;
            conductorMesh.rotation.y = Math.PI;
        }
    }
}

// ========================
//  تفاعل مع اللاعب
// ========================

function updateFacingPlayer(delta) {
    waitTimer -= delta;

    // التذكرة تظهر بعد ثانية من الصوت
    if (!playerTicketVisible &&
        waitTimer <= (CONDUCTOR.ticketWaitDuration / 1000) - 1 &&
        !playerTicketMesh) {
        showPlayerTicket();
    }

    if (waitTimer <= 0) {
        // خلص الوقت - الكمسري يمشي
        conductorState = 'done';
        conductorMesh.rotation.y = Math.PI; // يستدير ويمشي
        // يتحرك بعيد شوية
        conductorMesh.position.z -= 4.0;
        console.log('🎩 الكمسري خلص ومشى');
    }
}

// ========================
//  دوال مساعدة
// ========================

/**
 * نظرة عشوائية للركاب (يمين أو شمال)
 * 🔧 إصلاح: في النسخة القديمة كان فيه bug في اختيار الاتجاه
 */
function lookAtPassengers(seatZ) {
    // بص عشوائي يمين أو شمال (حسب الكراسي)
    const direction = Math.random() > 0.5 ? 1 : -1;
    conductorMesh.rotation.y = direction * (Math.PI / 4); // 45 درجة يمين أو شمال
}

/**
 * النظر للاعب (دوران الـ rotation.y لمواجهة الكاميرا)
 */
function lookAtPlayer() {
    const camera = getCamera();
    if (!camera) return;

    const dx = camera.position.x - conductorMesh.position.x;
    const dz = camera.position.z - conductorMesh.position.z;
    conductorMesh.rotation.y = Math.atan2(dx, dz);
}

/**
 * تشغيل صوت التذكرة
 */
function playTicketSound() {
    if (ticketSoundPlayed) return;

    const sound = getTicketSound();
    if (sound) {
        // في Babylon: BABYLON.Sound فيه play() مباشرة
        try {
            sound.play();
            console.log('🔊 ticket.mp3');
            ticketSoundPlayed = true;
        } catch (e) {
            console.warn('⚠️ مش قادر يشغل صوت التذكرة:', e.message);
        }
    }
}

/**
 * إظهار تذكرة قدام اللاعب (نفس موديل التذكرة الأصلي)
 */
async function showPlayerTicket() {
    const camera = getCamera();
    const scene = getScene();
    if (!camera || !scene || playerTicketVisible) return;

    try {
        // 🔧 إصلاح: استخدام MODELS.ticket من config بدل hardcoded path
        const result = await getModel(MODELS.ticket);
        playerTicketMesh = result.rootMesh;

        if (!playerTicketMesh) {
            console.error('❌ ماقدرتش أحمل موديل التذكرة');
            return;
        }

        // نفس حجم التذكرة الأصلية
        playerTicketMesh.scaling = new BABYLON.Vector3(0.00003, 0.00003, 0.00003);

        // وضعها قدام الكاميرا
        // الـ direction = forward vector للكاميرا
        const forward = camera.getDirection
            ? camera.getDirection(BABYLON.Vector3.Forward())
            : new BABYLON.Vector3(0, 0, -1);

        const ticketPos = camera.position.add(
            forward.scale(CONDUCTOR.ticketAppearDistance)
        );

        playerTicketMesh.position = ticketPos;

        // 🔧 إصلاح: في Babylon، lookAt بياخد target position مباشرة
        playerTicketMesh.lookAt(camera.position);

        playerTicketMesh.setEnabled(true);
        playerTicketVisible = true;
        console.log('🎫 تذكرة الكمسري ظهرت قدام اللاعب!');

    } catch (e) {
        console.error('❌ خطأ في إظهار تذكرة اللاعب:', e);
    }
}

// ========================
//  دوال عامة
// ========================

export function getConductorState() { return conductorState; }
export function getPlayerTicketMesh() { return playerTicketMesh; }

/**
 * فحص لمس التذكرة بالقرب (للـ desktop أو لو اللاعب مشي قريب)
 */
export function checkTicketTouch() {
    if (!playerTicketVisible || !playerTicketMesh) return;

    const camera = getCamera();
    if (!camera) return;

    const dx = camera.position.x - playerTicketMesh.position.x;
    const dz = camera.position.z - playerTicketMesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.4) {
        hidePlayerTicket();
        console.log('🎫✋ التذكرة اتلمت!');
    }
}

/**
 * فحص لمس التذكرة بالـ VR controller (raycasting)
 * @param {BABYLON.Ray} ray - شعاع من الـ right controller
 */
export function checkVRTicketTouch(ray) {
    if (!playerTicketVisible || !playerTicketMesh || !ray) return;

    const scene = getScene();
    if (!scene) return;

    // فحص intersection بالـ raycast
    const hit = scene.pickWithRay(ray, (mesh) => {
        // فحص لو الـ mesh هو تذكرة اللاعب أو ابن من children بتاعها
        return mesh === playerTicketMesh ||
               (playerTicketMesh.getChildMeshes &&
                playerTicketMesh.getChildMeshes().includes(mesh));
    });

    if (hit && hit.hit && hit.distance < 8.0) { // ضمن 8 متر
        hidePlayerTicket();
        console.log('🎫✋ التذكرة اتلمت بالذراع!');
    }
}

/**
 * إخفاء وحذف تذكرة اللاعب
 */
export function hidePlayerTicket() {
    if (playerTicketMesh) {
        // dispose بياخد المحل بتاع scene.remove() في Three
        playerTicketMesh.dispose();
        playerTicketMesh = null;
        playerTicketVisible = false;
        console.log('🎫 تذكرة الكمسري اختفت');
    }
}
