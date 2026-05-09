// camera.js - إدارة الكاميرا والتحكم (Desktop + VR Ready)
import { CAMERA, COLLISION, QUEST2_OPTIMIZATION } from './config.js';
import { checkCollision, checkPlayerCharacterCollision } from './collision.js';
import { getAllCharacterMeshes } from './crowd.js';
import { setCamera } from './scene.js';

// 🎮 Flag للتحكم Desktop - لما تخلص الاختبار خليه false وهيشتغل VR-only
const ENABLE_DESKTOP_CONTROLS = true;

let camera = null;          // الكاميرا الحالية (UniversalCamera أو WebXRCamera)
let universalCamera = null; // الكاميرا الأصلية (Desktop)
let xrCamera = null;        // كاميرا الـ VR
let canvas = null;
let scene = null;
let engine = null;
let xrHelper = null;        // WebXR experience helper
let isInVR = false;

// لـ VR controllers
let leftController = null;
let rightController = null;
let movementSpeed = CAMERA.speed * 0.6; // ✅ سرعة الحركة في VR (لازم أقل من playerRadius=0.4 لمنع الخش في الحيطان)
let rotationSpeed = 0.03;             // سرعة الدوران بالـ joystick

// لـ snap rotation (دوران تدريجي بدل سلس - مريح أكتر)
const USE_SNAP_ROTATION = true;
const SNAP_ANGLE = Math.PI / 6; // 30 درجة في كل ضغطة
let lastSnapTime = 0;
const SNAP_COOLDOWN = 300; // 300ms بين كل دوران

// 🎮 حالة أزرار الحركة على الشاشة (مؤقتة للاختبار)
const screenButtonsState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false
};
const SCREEN_BTN_SPEED = 0.24;          // ✅ × 8 من 0.03 (متناسب مع عالم × 8)
const SCREEN_BTN_VERTICAL_SPEED = 0.16; // ✅ × 8 من 0.02

// 👆 حالة الـ touch rotation (الدوران باللمس على الموبايل)
const touchRotationState = {
    isDragging: false,
    lastX: 0,
    lastY: 0,
    activePointerId: null
};
const TOUCH_ROTATION_SENSITIVITY = 0.005; // حساسية الدوران (أقل = أبطأ)
const PITCH_LIMIT = Math.PI / 2 - 0.1;    // حد الدوران لفوق/تحت (≈85°)

/**
 * تهيئة الكاميرا والإعدادات
 * @param {BABYLON.UniversalCamera} cam - الكاميرا
 * @param {BABYLON.Engine} eng - الإنجن
 * @param {HTMLCanvasElement} cvs - الكانفاس
 * @param {BABYLON.Scene} scn - المشهد
 */
export function initCamera(cam, eng, cvs, scn) {
    universalCamera = cam;
    camera = cam;
    engine = eng;
    canvas = cvs;
    scene = scn;

    // 🔑 موقع البداية: من config.js
    // - في الـ desktop: بياخد القيمة كاملة من CAMERA.defaultPosition
    // - في الـ VR: Y بيتعاد ضبطه لاحقاً في setupWebXR
    camera.position.x = CAMERA.defaultPosition.x;
    camera.position.y = CAMERA.defaultPosition.y;
    camera.position.z = CAMERA.defaultPosition.z;

    // إعدادات الكاميرا للـ desktop
    if (ENABLE_DESKTOP_CONTROLS) {
        setupDesktopControls();
    } else {
        camera.detachControl();
    }

    // إعداد أزرار الحركة على الشاشة (تشتغل دائماً للـ mobile/desktop)
    setupScreenButtons();

    // 👆 إعداد الدوران باللمس على الموبايل (drag على المشهد)
    setupTouchRotation();

    // 📍 إعداد زرار الإحداثيات (للاختبار)
    setupCoordsButton();

    setupResizeHandler();

    console.log('📷 الكاميرا اتظبطت');
    console.log(`🎮 Desktop controls: ${ENABLE_DESKTOP_CONTROLS ? 'مفعلة' : 'مغلقة'}`);
}

/**
 * إعداد تحكم الـ Desktop (WASD + Mouse) - مؤقت للاختبار
 */
function setupDesktopControls() {
    // ربط التحكم بالكانفاس
    camera.attachControl(canvas, true);

    // إعدادات الحركة (WASD)
    camera.keysUp = [87, 38];      // W + ↑
    camera.keysDown = [83, 40];    // S + ↓
    camera.keysLeft = [65, 37];    // A + ←
    camera.keysRight = [68, 39];   // D + →

    // السرعة (نسبة لـ Three.js)
    camera.speed = CAMERA.speed * 4;
    camera.angularSensibility = 4000; // حساسية الفأرة (أعلى = أبطأ)
    camera.inertia = 0.5;             // smoothing
    camera.fov = CAMERA.fov;

    // ❌ منع الدوران فوق/تحت بزاوية كبيرة (نفس CAMERA.latLimit)
    camera.upperBetaLimit = (90 + CAMERA.latLimit.max) * Math.PI / 180;
    camera.lowerBetaLimit = (90 + CAMERA.latLimit.min) * Math.PI / 180;

    // عدم السماح بالطيران (Y constant)
    camera.applyGravity = false; // مفيش جاذبية، نتحكم في Y يدوياً

    console.log('⌨️ Desktop controls: WASD للحركة + Mouse للدوران');
}

/**
 * إعداد أزرار الحركة على الشاشة (mouse + touch + multi-touch)
 * 6 أزرار: قدام، ورا، يمين، شمال، فوق، تحت
 * ✨ بيستخدم Pointer Events اللي بتدعم multi-touch تلقائياً
 *    (المستخدم يقدر يضغط أكتر من زرار في نفس الوقت)
 */
function setupScreenButtons() {
    const buttons = document.querySelectorAll('.move-btn');
    if (buttons.length === 0) {
        console.warn('⚠️ مفيش أزرار حركة في HTML');
        return;
    }

    buttons.forEach(btn => {
        const direction = btn.dataset.direction;
        if (!direction) return;

        // دالة موحدة للضغط (بداية الحركة)
        const startMove = (e) => {
            e.preventDefault();
            e.stopPropagation();
            screenButtonsState[direction] = true;
            btn.classList.add('active');

            // 📱 على الموبايل: capture الـ pointer عشان حتى لو الإصبع طلع برة الزرار
            //    وهو ضاغط، يفضل يحسبه على نفس الزرار (مش يفلت لما تتحرك)
            if (e.pointerId !== undefined && btn.setPointerCapture) {
                try {
                    btn.setPointerCapture(e.pointerId);
                } catch (err) {
                    // في بعض المتصفحات بيرمي error - عادي
                }
            }
        };

        // دالة موحدة لإيقاف الحركة
        const stopMove = (e) => {
            e.preventDefault();
            screenButtonsState[direction] = false;
            btn.classList.remove('active');

            // إفلات الـ pointer capture
            if (e.pointerId !== undefined && btn.releasePointerCapture) {
                try {
                    btn.releasePointerCapture(e.pointerId);
                } catch (err) {
                    // عادي
                }
            }
        };

        // ✨ Pointer Events - بتشتغل على Mouse + Touch + Pen
        //    وبتدعم multi-touch تلقائياً (كل إصبع له pointerId مختلف)
        btn.addEventListener('pointerdown', startMove);
        btn.addEventListener('pointerup', stopMove);
        btn.addEventListener('pointercancel', stopMove);
        btn.addEventListener('pointerleave', (e) => {
            // لو الإصبع طلع برة الزرار وهو مش ماسك (capture)
            // نوقف الحركة
            if (!btn.hasPointerCapture || !btn.hasPointerCapture(e.pointerId)) {
                stopMove(e);
            }
        });

        // 🛡️ منع الـ context menu على الموبايل (long press)
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // 🛡️ Safety: لو حصل أي حاجة وفقدنا الـ events،
    //    لما المستخدم يرفع إيده من على الشاشة، نوقف كل الحركة
    document.addEventListener('pointerup', () => {
        Object.keys(screenButtonsState).forEach(dir => {
            screenButtonsState[dir] = false;
        });
        document.querySelectorAll('.move-btn.active').forEach(b => {
            b.classList.remove('active');
        });
    });

    // لما الـ window يفقد الـ focus (مثلاً المستخدم سحب لتاب تاني)
    window.addEventListener('blur', () => {
        Object.keys(screenButtonsState).forEach(dir => {
            screenButtonsState[dir] = false;
        });
        document.querySelectorAll('.move-btn.active').forEach(b => {
            b.classList.remove('active');
        });
    });

    console.log('🎮 أزرار الحركة جاهزة (مع دعم multi-touch)');
}

/**
 * 👆 إعداد الدوران باللمس على الشاشة (drag على المشهد للف الكاميرا)
 * يشتغل على الموبايل + الديسكتوب (drag بالماوس)
 *
 * 🔑 ملاحظة: في الـ desktop الـ attachControl بيشغل الـ mouse rotation تلقائياً
 *    لكن على الموبايل الـ touch مش بيشتغل بنفس الطريقة، فعملنا custom solution
 */
function setupTouchRotation() {
    if (!canvas) return;

    // الدوران بيتم على الكاميرا الحالية (universal أو xr)
    // بنستخدم rotation مباشرة على الكاميرا

    // بداية اللمس
    canvas.addEventListener('pointerdown', (e) => {
        // تجاهل لو في VR
        if (isInVR) return;

        // تجاهل لو الإصبع على زرار من أزرار التحكم
        if (e.target && e.target.closest('#movement-controls, #action-controls, #log-pos-btn, #vr-button')) {
            return;
        }

        // بدء الـ drag
        touchRotationState.isDragging = true;
        touchRotationState.lastX = e.clientX;
        touchRotationState.lastY = e.clientY;
        touchRotationState.activePointerId = e.pointerId;

        // capture الـ pointer
        if (canvas.setPointerCapture) {
            try {
                canvas.setPointerCapture(e.pointerId);
            } catch (err) { /* عادي */ }
        }
    });

    // أثناء الحركة
    canvas.addEventListener('pointermove', (e) => {
        if (!touchRotationState.isDragging) return;
        if (e.pointerId !== touchRotationState.activePointerId) return;
        if (!camera) return;

        const deltaX = e.clientX - touchRotationState.lastX;
        const deltaY = e.clientY - touchRotationState.lastY;

        touchRotationState.lastX = e.clientX;
        touchRotationState.lastY = e.clientY;

        // تطبيق الدوران
        // ⚠️ مهم: في desktop UniversalCamera بيستخدم rotation.y و rotation.x
        // 🔑 مع scene.useRightHandedSystem = true:
        //    - تحريك يمين (deltaX موجب) → دوران ناحية الشمال (rotation.y سالب)
        //    - عشان كده بنستخدم -deltaX
        camera.rotation.y -= deltaX * TOUCH_ROTATION_SENSITIVITY;
        camera.rotation.x += deltaY * TOUCH_ROTATION_SENSITIVITY;

        // حد للدوران لفوق/تحت (مش يقلب الكاميرا)
        if (camera.rotation.x > PITCH_LIMIT) camera.rotation.x = PITCH_LIMIT;
        if (camera.rotation.x < -PITCH_LIMIT) camera.rotation.x = -PITCH_LIMIT;
    });

    // نهاية اللمس
    const endDrag = (e) => {
        if (e.pointerId !== touchRotationState.activePointerId) return;
        touchRotationState.isDragging = false;
        touchRotationState.activePointerId = null;
        if (canvas.releasePointerCapture) {
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch (err) { /* عادي */ }
        }
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    console.log('👆 الدوران باللمس جاهز (اسحب على المشهد للف الكاميرا)');
}

/**
 * 📍 إعداد زرار سحب الإحداثيات (للاختبار)
 * بينسخ الإحداثيات الحالية للـ clipboard وبيطبعها
 */
function setupCoordsButton() {
    const btn = document.getElementById('log-pos-btn');
    const display = document.getElementById('coords-display');

    if (!btn) {
        console.warn('⚠️ مفيش زرار إحداثيات في HTML');
        return;
    }

    // تحديث العرض المستمر للإحداثيات
    if (display) {
        setInterval(() => {
            if (camera && !isInVR) {
                const x = camera.position.x.toFixed(3);
                const y = camera.position.y.toFixed(3);
                const z = camera.position.z.toFixed(3);
                const rotY = ((camera.rotation.y * 180 / Math.PI) % 360).toFixed(1);
                display.innerHTML = `X: ${x}<br>Y: ${y}<br>Z: ${z}<br>RotY: ${rotY}°`;
            }
        }, 100); // تحديث 10 مرات في الثانية
    }

    // عند الضغط على الزرار - نسخ الإحداثيات
    btn.addEventListener('click', () => {
        if (!camera) return;

        const x = camera.position.x.toFixed(3);
        const y = camera.position.y.toFixed(3);
        const z = camera.position.z.toFixed(3);
        const rotY = camera.rotation.y.toFixed(3);
        const rotX = camera.rotation.x.toFixed(3);

        // النص اللي هيتنسخ
        const textToCopy = `x: ${x}, y: ${y}, z: ${z}, rotY: ${rotY}, rotX: ${rotX}`;

        // محاولة النسخ للـ clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                console.log('📍 الإحداثيات اتنسخت:', textToCopy);
                btn.textContent = '✅ اتنسخ!';
                setTimeout(() => { btn.textContent = '📍 نسخ الإحداثيات'; }, 1500);
            }).catch(() => {
                fallbackCopy(textToCopy, btn);
            });
        } else {
            fallbackCopy(textToCopy, btn);
        }

        // طباعة في الـ console كمان
        console.log(`📍 الإحداثيات:
  X: ${x}
  Y: ${y}
  Z: ${z}
  RotY: ${rotY} rad (${(rotY * 180 / Math.PI).toFixed(1)}°)
  RotX: ${rotX} rad (${(rotX * 180 / Math.PI).toFixed(1)}°)`);
    });

    console.log('📍 زرار الإحداثيات جاهز');
}

/**
 * Fallback للنسخ لو navigator.clipboard مش متاح (HTTPS غير مفعل)
 */
function fallbackCopy(text, btn) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        console.log('📍 الإحداثيات اتنسخت (fallback):', text);
        if (btn) {
            btn.textContent = '✅ اتنسخ!';
            setTimeout(() => { btn.textContent = '📍 نسخ الإحداثيات'; }, 1500);
        }
    } catch (e) {
        console.warn('⚠️ مش قادر ينسخ - هتلاقي الإحداثيات في الـ console');
    }
    document.body.removeChild(textarea);
}

/**
 * تحديث الحركة بناء على أزرار الشاشة (يتنادى من updateCamera كل فريم)
 */
function updateScreenButtonMovement() {
    if (!camera) return;

    // فحص لو أي زرار مضغوط
    const anyPressed = Object.values(screenButtonsState).some(v => v);
    if (!anyPressed) return;

    // الاتجاه اللي بتبص ليه الكاميرا (forward/right)
    const forward = camera.getDirection(BABYLON.Vector3.Forward());
    forward.y = 0; // مفيش طيران في الحركة الأفقية
    forward.normalize();

    const right = camera.getDirection(BABYLON.Vector3.Right());
    right.y = 0;
    right.normalize();

    let moveX = 0;
    let moveZ = 0;
    let moveY = 0;

    // قدام / ورا
    if (screenButtonsState.forward) {
        moveX += forward.x * SCREEN_BTN_SPEED;
        moveZ += forward.z * SCREEN_BTN_SPEED;
    }
    if (screenButtonsState.backward) {
        moveX -= forward.x * SCREEN_BTN_SPEED;
        moveZ -= forward.z * SCREEN_BTN_SPEED;
    }

    // يمين / شمال (strafe)
    if (screenButtonsState.right) {
        moveX += right.x * SCREEN_BTN_SPEED;
        moveZ += right.z * SCREEN_BTN_SPEED;
    }
    if (screenButtonsState.left) {
        moveX -= right.x * SCREEN_BTN_SPEED;
        moveZ -= right.z * SCREEN_BTN_SPEED;
    }

    // فوق / تحت
    if (screenButtonsState.up) {
        moveY += SCREEN_BTN_VERTICAL_SPEED;
    }
    if (screenButtonsState.down) {
        moveY -= SCREEN_BTN_VERTICAL_SPEED;
    }

    // تطبيق الحركة (الـ collision check بيحصل في updateCamera)
    camera.position.x += moveX;
    camera.position.z += moveZ;
    camera.position.y += moveY;
}

/**
 * تحديث الكاميرا (collision + Y lock + VR controllers + screen buttons)
 */
export function updateCamera() {
    if (!camera) return;

    // 1. تحديث حركة أزرار الشاشة (لو مش في VR)
    if (!isInVR) {
        updateScreenButtonMovement();
    }

    // 2. فحص التصادم على X و Z
    const result = checkCollision(camera.position.x, camera.position.z);
    camera.position.x = result.x;
    camera.position.z = result.z;

    // 2.5 فحص التصادم مع الشخصيات
    const charMeshes = getAllCharacterMeshes();
    if (charMeshes.length > 0) {
        const charResult = checkPlayerCharacterCollision(
            camera.position.x,
            camera.position.z,
            COLLISION.playerRadius,
            charMeshes
        );
        camera.position.x = charResult.x;
        camera.position.z = charResult.z;
    }

    // 3. تثبيت ارتفاع الكاميرا (مع السماح بالحركة العمودية بأزرار الشاشة)
    if (!isInVR) {
        // الحد الأدنى للـ Y (مش يغطس تحت الأرض)
        if (camera.position.y < 0.1) {
            camera.position.y = 0.1;
        }
        // الحد الأقصى (مش يطير عالي قوي)
        if (camera.position.y > 3.0) {
            camera.position.y = 3.0;
        }
    }
    // في VR: الـ headset بيتحكم في Y تلقائياً

    // 4. تحديث VR controllers لو في VR
    if (isInVR) {
        updateVRControllers();
    }
}

// ========================
//  WebXR Setup (VR على Quest 2)
// ========================

/**
 * تفعيل WebXR للـ VR على Quest 2
 * @param {BABYLON.Scene} scn - المشهد
 * @returns {Promise<BABYLON.WebXRDefaultExperience>}
 */
export async function setupWebXR(scn) {
    try {
        // إنشاء WebXR experience مع كل الميزات الأساسية
        xrHelper = await scn.createDefaultXRExperienceAsync({
            // الأرضية للـ teleportation (لو هنفعلها)
            floorMeshes: [],
            // Reference space type
            uiOptions: {
                sessionMode: 'immersive-vr',
                referenceSpaceType: 'local-floor' // مهم لـ Quest 2
            },
            // عدم إنشاء Default UI - هنستخدم زر custom
            disableDefaultUI: false,
            // عدم تفعيل teleportation تلقائياً (هنعملها manually)
            disableTeleportation: true
        });

        if (!xrHelper.baseExperience) {
            console.warn('⚠️ WebXR مش مدعوم في المتصفح ده');
            return null;
        }

        // مرجع كاميرا الـ VR
        xrCamera = xrHelper.baseExperience.camera;

        // الإيفنتس - دخول وخروج VR
        xrHelper.baseExperience.onStateChangedObservable.add((state) => {
            switch (state) {
                case BABYLON.WebXRState.IN_XR:
                    onEnterVR();
                    break;
                case BABYLON.WebXRState.NOT_IN_XR:
                    onExitVR();
                    break;
                case BABYLON.WebXRState.ENTERING_XR:
                    console.log('🥽 جاري الدخول للـ VR...');
                    break;
            }
        });

        // إعداد الـ controllers
        setupVRControllerEvents();

        // تفعيل foveated rendering لـ Quest 2 (تحسين أداء كبير)
        try {
            const xrSession = xrHelper.baseExperience.sessionManager;
            if (xrSession.session && xrSession.session.renderState) {
                // Foveation هيتفعل تلقائياً لما الـ session تبدأ
                console.log('🎯 Foveated rendering هيتفعل في الـ VR session');
            }
        } catch (e) {
            console.warn('⚠️ مش قادر يفعل foveation:', e.message);
        }

        console.log('✅ WebXR جاهز للدخول لـ VR');
        return xrHelper;

    } catch (error) {
        console.error('❌ فشل تهيئة WebXR:', error);
        return null;
    }
}

/**
 * بدء جلسة VR (يتنادى من زر الدخول لـ VR)
 */
export async function enterVR() {
    if (!xrHelper) {
        console.error('❌ WebXR مش مهيأ');
        return false;
    }

    try {
        await xrHelper.baseExperience.enterXRAsync(
            'immersive-vr',
            'local-floor'
        );
        return true;
    } catch (error) {
        console.error('❌ فشل الدخول للـ VR:', error);
        alert('🥽 ماقدرناش ندخل عالم VR. تأكد إن النضارة موصولة وفتحت الموقع من Browser الـ Quest.');
        return false;
    }
}

/**
 * عند الدخول للـ VR
 */
function onEnterVR() {
    isInVR = true;
    camera = xrCamera; // التحويل للـ XR camera

    // إضافة class للـ body عشان نخفي أزرار الشاشة
    document.body.classList.add('in-vr');

    // 🔑 تعيين موقع البداية في VR:
    // - X و Z: نفس مكان البداية
    // - Y: من config (يتظبط حسب طول اللاعب الحقيقي والعالم × 8)
    if (xrCamera) {
        xrHelper.baseExperience.camera.position.x = CAMERA.defaultPosition.x;
        xrHelper.baseExperience.camera.position.y = CAMERA.defaultPosition.y;
        xrHelper.baseExperience.camera.position.z = CAMERA.defaultPosition.z;
        console.log('🥽 موقع البداية في VR: Y=' + CAMERA.defaultPosition.y);
    }

    // تحديث الـ scene reference
    setCamera(xrCamera);

    // تفعيل foveation عند بداية الـ session
    try {
        if (xrHelper.baseExperience.sessionManager.session) {
            const layer = xrHelper.baseExperience.sessionManager.session.renderState.baseLayer;
            if (layer && 'fixedFoveation' in layer) {
                layer.fixedFoveation = QUEST2_OPTIMIZATION.fixedFoveation; // 0.3
                console.log('🎯 Fixed foveation اتفعل:', QUEST2_OPTIMIZATION.fixedFoveation);
            }
        }
    } catch (e) {
        console.warn('⚠️ مش قادر يفعل fixed foveation');
    }

    console.log('🥽✅ في VR دلوقتي!');
}

/**
 * عند الخروج من الـ VR
 */
function onExitVR() {
    isInVR = false;
    camera = universalCamera; // الرجوع للـ universal camera
    setCamera(universalCamera);

    // إزالة class الـ VR من body عشان أزرار الشاشة ترجع تظهر
    document.body.classList.remove('in-vr');

    console.log('🚪 خرجت من الـ VR');
}

// ========================
//  VR Controllers (Quest 2 joystick + buttons)
// ========================

/**
 * إعداد إيفنتس الـ controllers (تتنادى مرة واحدة)
 */
function setupVRControllerEvents() {
    if (!xrHelper) return;

    const inputSource = xrHelper.input;

    // لما controller يتوصل
    inputSource.onControllerAddedObservable.add((controller) => {
        console.log(`🎮 Controller اتوصل: ${controller.inputSource.handedness}`);

        // ربط الـ controller بناء على اليد
        controller.onMotionControllerInitObservable.add((motionController) => {
            const handedness = motionController.handedness;

            if (handedness === 'left') {
                leftController = motionController;
                console.log('🎮 Left controller جاهز');
            } else if (handedness === 'right') {
                rightController = motionController;
                console.log('🎮 Right controller جاهز');
                setupRightControllerInteractions();
            }
        });
    });

    // لما controller يتفصل
    inputSource.onControllerRemovedObservable.add((controller) => {
        console.log(`🎮 Controller اتفصل: ${controller.inputSource.handedness}`);
    });
}

/**
 * تحديث الـ controllers كل فريم (joystick movement + rotation)
 */
function updateVRControllers() {
    // اليسار: حركة (forward/back/strafe)
    if (leftController) {
        const thumbstick = leftController.getComponent('xr-standard-thumbstick');
        if (thumbstick && thumbstick.axes) {
            const x = thumbstick.axes.x; // -1 شمال، 1 يمين
            const y = thumbstick.axes.y; // -1 قدام، 1 ورا

            // نسبة dead zone عشان مايتحركش لوحده
            const deadZone = 0.15;

            if (Math.abs(x) > deadZone || Math.abs(y) > deadZone) {
                moveInVR(x, y);
            }
        }
    }

    // اليمين: دوران (snap أو smooth)
    if (rightController) {
        const thumbstick = rightController.getComponent('xr-standard-thumbstick');
        if (thumbstick && thumbstick.axes) {
            const x = thumbstick.axes.x;

            if (USE_SNAP_ROTATION) {
                handleSnapRotation(x);
            } else {
                handleSmoothRotation(x);
            }
        }
    }
}

/**
 * حركة في الـ VR بناء على الجوي ستيك
 */
function moveInVR(x, y) {
    if (!xrCamera) return;

    // الاتجاه اللي بيبص له اللاعب (forward direction)
    const forward = xrCamera.getDirection(BABYLON.Vector3.Forward());
    forward.y = 0; // مفيش طيران
    forward.normalize();

    // الاتجاه الجانبي (right direction)
    const right = xrCamera.getDirection(BABYLON.Vector3.Right());
    right.y = 0;
    right.normalize();

    // حساب الحركة (y سالبة = قدام في الـ thumbstick)
    const moveX = (forward.x * y + right.x * x) * movementSpeed;
    const moveZ = (forward.z * y + right.z * x) * movementSpeed;

    // تطبيق الحركة (مع التصادم)
    const newX = xrCamera.position.x + moveX;
    const newZ = xrCamera.position.z + moveZ;

    const result = checkCollision(newX, newZ);
    xrCamera.position.x = result.x;
    xrCamera.position.z = result.z;
}

/**
 * دوران تدريجي (snap rotation) - مريح للـ VR، بيقلل دوار الحركة
 */
function handleSnapRotation(x) {
    const now = performance.now();
    if (now - lastSnapTime < SNAP_COOLDOWN) return;

    const threshold = 0.7; // لازم الجوي ستيك يتحرك لحد كبير

    if (x > threshold) {
        // دوران يمين
        rotateXRCamera(SNAP_ANGLE);
        lastSnapTime = now;
    } else if (x < -threshold) {
        // دوران شمال
        rotateXRCamera(-SNAP_ANGLE);
        lastSnapTime = now;
    }
}

/**
 * دوران سلس (smooth rotation) - بديل
 */
function handleSmoothRotation(x) {
    const deadZone = 0.15;
    if (Math.abs(x) < deadZone) return;

    rotateXRCamera(x * rotationSpeed);
}

/**
 * دوران كاميرا الـ VR حول محور Y
 */
function rotateXRCamera(angle) {
    if (!xrCamera || !xrHelper) return;

    // الطريقة الصحيحة لدوران WebXR camera هي عن طريق الـ session reference space
    // أو بتعديل الـ rotationQuaternion على الـ root
    try {
        // استخدام rotationQuaternion (Babylon موصي به في 8.x)
        if (!xrCamera.rotationQuaternion) {
            xrCamera.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(0, 0, 0);
        }

        const rotation = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, angle);
        xrCamera.rotationQuaternion = rotation.multiply(xrCamera.rotationQuaternion);
    } catch (e) {
        console.warn('⚠️ فشل الدوران:', e.message);
    }
}

/**
 * إعداد التفاعل مع الـ right controller (trigger + grip للتذكرة)
 */
function setupRightControllerInteractions() {
    if (!rightController) return;

    // Trigger button (الزر الكبير تحت الإصبع)
    const triggerComponent = rightController.getComponent('xr-standard-trigger');
    if (triggerComponent) {
        triggerComponent.onButtonStateChangedObservable.add(() => {
            if (triggerComponent.changes.pressed) {
                if (triggerComponent.pressed) {
                    onTriggerPressed();
                }
            }
        });
    }

    // Grip button (الزر اللي بنمسك بيه)
    const gripComponent = rightController.getComponent('xr-standard-squeeze');
    if (gripComponent) {
        gripComponent.onButtonStateChangedObservable.add(() => {
            if (gripComponent.changes.pressed && gripComponent.pressed) {
                onGripPressed();
            }
        });
    }
}

/**
 * عند ضغط الـ trigger - فحص لمس التذكرة
 */
function onTriggerPressed() {
    // استدعاء دالة فحص التذكرة من conductor.js
    import('./conductor.js').then(m => {
        m.checkVRTicketTouch?.(getRightControllerRay());
    });
}

/**
 * عند ضغط الـ grip - بديل أو إضافي
 */
function onGripPressed() {
    // ممكن نستخدمه للتفاعل البديل
    onTriggerPressed(); // نفس الفعل
}

/**
 * الحصول على شعاع من الـ right controller (للـ raycasting)
 */
export function getRightControllerRay() {
    if (!rightController) return null;

    const grip = rightController.rootMesh;
    if (!grip) return null;

    // اتجاه الشعاع: من الـ controller للأمام
    const origin = grip.absolutePosition.clone();
    const forward = new BABYLON.Vector3(0, 0, 1); // forward direction
    const direction = BABYLON.Vector3.TransformNormal(
        forward,
        grip.getWorldMatrix()
    );

    return new BABYLON.Ray(origin, direction.normalize(), 5);
}

/**
 * الحصول على موقع الـ right controller
 */
export function getRightControllerPosition() {
    if (!rightController || !rightController.rootMesh) return null;
    return rightController.rootMesh.absolutePosition.clone();
}

// ========================
//  Window Resize
// ========================

function setupResizeHandler() {
    window.addEventListener('resize', () => {
        if (!engine) return;
        engine.resize();
    });
}

// ========================
//  دوال الوصول
// ========================

export function getCurrentCamera() { return camera; }
export function getXRHelper() { return xrHelper; }
export function getIsInVR() { return isInVR; }
export function isMoving() { return false; } // للتوافق مع الكود القديم
export function getRotation() { return { lon: 0, lat: 0 }; } // للتوافق
