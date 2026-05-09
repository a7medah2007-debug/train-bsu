// main.js - المنسق الرئيسي للمشروع (Babylon.js نسخة)
import { setupScene, getEngine, getCanvas, getScene } from './scene.js';
import { initLoader, loadAllModels, loadSounds, getTicketModel, toggleDoor, getDoorState } from './models.js';
import { initCrowd, updateCrowd, initTicketQueue } from './crowd.js';
import { initCamera, updateCamera, setupWebXR, enterVR, getIsInVR } from './camera.js';
import { checkDistance, startGameLogic, updateTimedEvents } from './logic.js';
import { updateConductor } from './conductor.js';
import { openStationDoors } from './collision.js';

// --- المتغيرات الأساسية ---
let scene = null;
let camera = null;
let engine = null;
let canvas = null;
let xrHelper = null;

// --- بدء المشروع ---
init();

/**
 * التهيئة الرئيسية
 */
async function init() {
    console.log('🚂 بدء تشغيل محطة القطار (Babylon.js)...');

    try {
        // 1. إعداد المشهد الأساسي (Engine + Scene + Camera + Lights + Walls)
        const setup = setupScene();
        if (!setup) {
            console.error('❌ فشل إعداد المشهد');
            return;
        }
        scene = setup.scene;
        camera = setup.camera;
        engine = setup.engine;
        canvas = setup.canvas;

        // 2. تهيئة المحمل
        initLoader(scene);

        // 3. تحميل كل الموديلات
        console.log('📦 جاري تحميل الموديلات...');
        await loadAllModels(scene);
        console.log('✅ تم تحميل جميع الموديلات');

        // 4. تحميل الأصوات (ينتظر تفعيل AudioContext تلقائياً)
        console.log('🔊 جاري تحميل الأصوات...');
        await loadSounds(scene);
        console.log('✅ تم تحميل الأصوات');

        // ✅ تفعيل الفيديو مسبقاً عند أول تفاعل من المستخدم
        // ⚠️ شيلت الـ warmup اللي كان بيشغل الفيديو 200ms عند أول تفاعل
        //    لأنه كان بيخلي الفيديو يظهر قبل ميعاده.
        //    دلوقتي الفيديو هيشتغل بس من logic.js لما الشروط تتحقق.
        // enableVideoOnFirstInteraction(); // معطلة - الفيديو هيشتغل من logic فقط

        // 5. تهيئة الزحمة
        console.log('👥 جاري تحميل الركاب...');
        await initCrowd(scene);
        console.log('✅ تم تحميل الزحمة');
// 5.5 تهيئة طابور التذاكر
        await initTicketQueue(scene);
        // 6. تهيئة الكاميرا والتحكم
        initCamera(camera, engine, canvas, scene);

        // 7. إعداد WebXR (للـ Quest 2)
        console.log('🥽 جاري إعداد WebXR...');
        xrHelper = await setupWebXR(scene);
        if (xrHelper) {
            console.log('✅ WebXR جاهز');
            // ✅ ربط أزرار VR controllers (Trigger / Squeeze)
            setupVRControllers(xrHelper);
        } else {
            console.warn('⚠️ WebXR مش متاح - هتشتغل في desktop mode بس');
        }

        // 8. ربط زر VR
        setupVRButton();

        // 9. ربط أزرار التفاعل المؤقتة (التذكرة + الباب)
        setupActionButtons();

        // 10. بدء منطق الأحداث
        startGameLogic();

        // 11. بدء حلقة التحديث (Babylon: runRenderLoop بدل setAnimationLoop)
        engine.runRenderLoop(update);

        // 12. إخفاء شاشة التحميل
        hideLoadingScreen();
document.getElementById('bg-music')?.play().catch(() => {});
        console.log('🎮 جاهز للعب!');

    } catch (error) {
        console.error('❌ خطأ في التهيئة:', error);
        alert('حصلت مشكلة أثناء التحميل. شوف الـ console للتفاصيل.');
    }
}

/**
 * ✅ يجعل الفيديو جاهزاً للتشغيل التلقائي لاحقاً
 * عن طريق تشغيله وإيقافه فوراً بعد أول نقرة/لمس من المستخدم
 */
function enableVideoOnFirstInteraction() {
    const activate = async () => {
        // ✅ ثم تشغيل الفيديو وإيقافه
        try {
            const { playWindowVideo, stopWindowVideo } = await import('./scene.js');
            playWindowVideo();
            setTimeout(() => stopWindowVideo(), 200);
        } catch (e) {
            // تجاهل
        }

        // إزالة المستمعين
        ['click', 'touchstart', 'keydown'].forEach(evt =>
            document.removeEventListener(evt, activate)
        );
    };

    ['click', 'touchstart', 'keydown'].forEach(evt =>
        document.addEventListener(evt, activate, { once: true })
    );
}

/**
 * إعداد أزرار VR controllers (Trigger/Squeeze لالتقاط التذكرة)
 */
function setupVRControllers(xr) {
    if (!xr?.input) return;

    xr.input.onControllerAddedObservable.add(ctrl => {
        ctrl.onMotionControllerInitObservable.add(mc => {
            const hand = mc.handedness;
            console.log(`🎮 Controller: ${hand}`);

            if (hand === 'right') {
                // Trigger → مسك التذكرة
                const trigger = mc.getComponent('xr-standard-trigger');
                if (trigger) {
                    trigger.onButtonStateChangedObservable.add(comp => {
                        if (comp.changes.pressed?.current === true) {
                            onVRTriggerPressed();
                        }
                    });
                }

                // Squeeze (grip) → بديل للـ Trigger
                const squeeze = mc.getComponent('xr-standard-squeeze');
                if (squeeze) {
                    squeeze.onButtonStateChangedObservable.add(comp => {
                        if (comp.changes.pressed?.current === true) {
                            onVRTriggerPressed();
                        }
                    });
                }
            }
            // اليد اليسرى محجوزة للمستقبل
        });
    });

    console.log('🎮 VR Controllers جاهزة');
}

/**
 * دالة يتم استدعاؤها عند الضغط على Trigger أو Squeeze في VR
 * تقوم بالتقاط التذكرة الظاهرة أمام اللاعب (تذكرة الكمسري)
 */
function onVRTriggerPressed() {
    import('./conductor.js').then(m => {
        if (m.getPlayerTicketMesh && m.getPlayerTicketMesh()) {
            m.hidePlayerTicket();
            showToast('🎫✅ تذكرة الكمسري اتاخدت!');
            console.log('🎫 تذكرة الكمسري اتاخدت بالـ VR controller');
        } else {
            // لو مفيش تذكرة كمسري، نجرب تذكرة الموظف (اختياري)
            const ticket = getTicketModel();
            if (ticket && ticket.isEnabled && ticket.isEnabled()) {
                ticket.setEnabled(false);
                if (ticket.getChildMeshes) {
                    ticket.getChildMeshes().forEach(m => m.setEnabled(false));
                }
                openStationDoors();
                showToast('🎫✅ التذكرة الأولى اتاخدت!');
                console.log('🎫 تذكرة الموظف اتاخدت بالـ VR controller');
            } else {
                showToast('⚠️ مفيش تذكرة دلوقتي');
            }
        }
    });
}

/**
 * حلقة التحديث الرئيسية (تشتغل كل فريم)
 */
function update() {
    if (!scene || !engine) return;

    // الـ delta بالثواني (Babylon بيرجعه بالـ ms)
    const delta = engine.getDeltaTime() / 1000;
    const currentTime = performance.now();

    // 1. تحديث الزحمة (الماشيين والـ animations بتاعتهم)
    updateCrowd(delta);

    // 2. تحديث الكاميرا (collision + VR controllers)
    updateCamera();

    // 3. فحص المسافة والأحداث
    checkDistance();

    // 4. تحديث الأحداث الزمنية
    updateTimedEvents(currentTime);

    // 5. تحديث الكمسري
    updateConductor(delta);

    // 6. الريندر (في Babylon: scene.render() بدل renderer.render())
    scene.render();
}

/**
 * ربط زر VR بدالة الدخول
 */
function setupVRButton() {
    const vrButton = document.getElementById('vr-button');
    if (!vrButton) {
        console.warn('⚠️ مفيش زر VR في HTML');
        return;
    }

    vrButton.addEventListener('click', async () => {
        if (!xrHelper) {
            alert('🚫 WebXR مش متاح. تأكد إنك بتفتح الموقع من Quest 2 Browser أو Chrome مع flag مفعل.');
            return;
        }

        const success = await enterVR();
        if (success) {
            // إخفاء الزر بعد الدخول للـ VR
            vrButton.style.display = 'none';
        }
    });

    console.log('🎮 زر VR جاهز');
}

/**
 * ⚠️ ربط أزرار التفاعل المؤقتة (التذكرة + الباب) - للاختبار
 */
function setupActionButtons() {
    // 🎫 زرار مسك التذكرة
    const grabTicketBtn = document.getElementById('grab-ticket-btn');
    if (grabTicketBtn) {
        grabTicketBtn.addEventListener('click', () => {
            handleGrabTicket();
        });
        console.log('🎫 زرار مسك التذكرة جاهز');
    }

    // 🚪 زرار فتح/قفل الباب
    const toggleDoorBtn = document.getElementById('toggle-door-btn');
    if (toggleDoorBtn) {
        toggleDoorBtn.addEventListener('click', () => {
            handleToggleDoor(toggleDoorBtn);
        });
        console.log('🚪 زرار الباب جاهز');
    }
}

/**
 * 🎫 مسك التذكرة (للاختبار - بيلتقط أي تذكرة موجودة في المشهد)
 */
function handleGrabTicket() {
    // محاولة 1: تذكرة الموظف (الأساسية في غرفة التذاكر)
    const ticket = getTicketModel();
    if (ticket && ticket.isEnabled && ticket.isEnabled()) {
        ticket.setEnabled(false);
        if (ticket.getChildMeshes) {
            ticket.getChildMeshes().forEach(m => m.setEnabled(false));
        }
        // فتح أبواب المحطة (نفس اللي بيحصل في القصة)
        openStationDoors();
        showToast('🎫✅ التذكرة الأولى اتاخدت!');
        console.log('🎫 تذكرة الموظف اتاخدت بالزرار');
        return;
    }

    // محاولة 2: تذكرة الكمسري (لو ظهرت)
    import('./conductor.js').then(m => {
        const conductorTicket = m.getPlayerTicketMesh?.();
        if (conductorTicket) {
            m.hidePlayerTicket?.();
            showToast('🎫✅ تذكرة الكمسري اتاخدت!');
            console.log('🎫 تذكرة الكمسري اتاخدت بالزرار');
            return;
        }
        // ولا واحدة موجودة
        showToast('⚠️ مفيش تذكرة دلوقتي');
        console.log('⚠️ مفيش تذكرة ظاهرة في المشهد دلوقتي');
    });
}

/**
 * 🚪 فتح/قفل الباب (للاختبار)
 */
function handleToggleDoor(btn) {
    if (!scene) {
        console.warn('⚠️ المشهد مش جاهز');
        return;
    }

    const wasOpen = getDoorState();
    const success = toggleDoor(scene);

    if (success) {
        // تحديث شكل الزرار حسب الحالة الجديدة
        // (الـ animation بياخد ثانية فهنحدث بعدها)
        setTimeout(() => {
            const isNowOpen = getDoorState();
            if (isNowOpen) {
                btn.textContent = '🚪 قفل الباب';
                btn.classList.add('open-state');
                showToast('🚪✅ الباب اتفتح!');
            } else {
                btn.textContent = '🚪 فتح الباب';
                btn.classList.remove('open-state');
                showToast('🚪 الباب اتقفل');
            }
        }, 1100); // بعد ما الانيميشن يخلص
    } else {
        showToast('⚠️ الباب لسه بيتحرك أو مش جاهز');
    }
    console.log('🚪 زرار الباب اتضغط!');
    console.log('scene:', scene);
    console.log('doorState:', getDoorState());
    
}

/**
 * إظهار toast notification بسيطة
 */
function showToast(message, duration = 2000) {
    // إنشاء toast لو مش موجود
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: #ffd700;
            padding: 12px 24px;
            border-radius: 25px;
            border: 2px solid #ffd700;
            font-family: 'Arial', sans-serif;
            font-size: 16px;
            font-weight: bold;
            z-index: 1500;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s;
            text-align: center;
            max-width: 80%;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
    }, duration);
}

/**
 * إخفاء شاشة التحميل بانيميشن
 */
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 800);
    }
}

// تنظيف الذاكرة عند إغلاق الصفحة
window.addEventListener('beforeunload', () => {
    if (engine) {
        engine.dispose();
    }
});