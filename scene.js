// scene.js - بناء المشهد والإضاءة والعناصر الأساسية (Babylon.js نسخة)
import {
    SCENE_BACKGROUND, LIGHT, ENGINE, WALLS, VIDEO_PATH, VIDEO_CONFIG,
    TRAIN_OPENINGS,
    WINDOW_RIGHT_X, WINDOW_LEFT_X, IMAGE_WALLS, IMAGE_WALL_POSITIONS,
    CAMERA, QUEST2_OPTIMIZATION
} from './config.js';

let engine = null;
let scene = null;
let camera = null;
let canvas = null;

/**
 * تهيئة المشهد الأساسي (Engine + Scene + Camera + Lights + Walls + Videos + Images)
 * @returns {{ scene: BABYLON.Scene, camera: BABYLON.UniversalCamera, engine: BABYLON.Engine, canvas: HTMLCanvasElement }}
 */
export function setupScene() {
    // --- الكانفاس ---
    canvas = document.getElementById('renderCanvas');
    if (!canvas) {
        console.error('❌ ماقدرتش الاقي canvas#renderCanvas في HTML!');
        return null;
    }

    // --- الإنجن (بديل WebGLRenderer في Three) ---
    engine = new BABYLON.Engine(canvas, ENGINE.antialias, {
        preserveDrawingBuffer: ENGINE.preserveDrawingBuffer,
        stencil: ENGINE.stencil,
        powerPreference: ENGINE.powerPreference,
        premultipliedAlpha: ENGINE.premultipliedAlpha,
        adaptToDeviceRatio: ENGINE.adaptToDeviceRatio
    });

    // تحسين الأداء على Quest 2
    engine.setHardwareScalingLevel(QUEST2_OPTIMIZATION.hardwareScalingLevel);

    // --- المشهد ---
    scene = new BABYLON.Scene(engine);

    // 🔑 مهم جداً: تفعيل Right-Handed System عشان الإحداثيات تشتغل زي Three.js بالظبط
    scene.useRightHandedSystem = true;

    // لون الخلفية (Color3 من قيم 0-1)
    scene.clearColor = new BABYLON.Color4(
        SCENE_BACKGROUND.r,
        SCENE_BACKGROUND.g,
        SCENE_BACKGROUND.b,
        1.0
    );

    // --- الكاميرا ---
    // UniversalCamera = أقرب حاجة لـ PerspectiveCamera في Three (يدعم WASD + Mouse)
    camera = new BABYLON.UniversalCamera(
        'mainCamera',
        new BABYLON.Vector3(
            CAMERA.defaultPosition.x,
            CAMERA.defaultPosition.y,
            CAMERA.defaultPosition.z
        ),
        scene
    );

    camera.fov = CAMERA.fov;
    camera.minZ = CAMERA.minZ;
    camera.maxZ = CAMERA.maxZ;

    // الكاميرا هتتربط بالكانفاس في camera.js (عشان نتحكم في الإعدادات)
    camera.setTarget(new BABYLON.Vector3(0, 0.15, 0)); // البص ناحية مركز المشهد

    // --- الإضاءة ---
    setupLights();

    // --- بناء الجدران ---
    buildWalls();

    // --- إنشاء فيديو الشبابيك (مخفي في البداية) ---
    createWindowVideos();

    // --- إنشاء صور الحوائط ---
    createImageWalls();

    // --- تحسينات أداء Quest 2 ---
    optimizeForQuest2();

    return { scene, camera, engine, canvas };
}

/**
 * إعداد كل الإضاءة (نفس الـ lights اللي كانت في Three.js)
 */
function setupLights() {
    // ضوء محيطي عام (HemisphericLight = أقرب حاجة لـ AmbientLight)
    const ambient = new BABYLON.HemisphericLight(
        'ambientLight',
        new BABYLON.Vector3(0, 1, 0),
        scene
    );
    ambient.intensity = LIGHT.ambientIntensity;
    ambient.diffuse = new BABYLON.Color3(
        LIGHT.ambientColor.r,
        LIGHT.ambientColor.g,
        LIGHT.ambientColor.b
    );
    ambient.groundColor = new BABYLON.Color3(0.2, 0.2, 0.25);

    // ضوء اتجاهي رئيسي (شمس)
    const sunLight = new BABYLON.DirectionalLight(
        'sunLight',
        new BABYLON.Vector3(-0.5, -1, -0.3), // اتجاه الضوء (من فوق ومائل)
        scene
    );
    sunLight.position = new BABYLON.Vector3(
        LIGHT.sunPosition.x,
        LIGHT.sunPosition.y,
        LIGHT.sunPosition.z
    );
    sunLight.intensity = LIGHT.sunIntensity;
    sunLight.diffuse = new BABYLON.Color3(
        LIGHT.sunColor.r,
        LIGHT.sunColor.g,
        LIGHT.sunColor.b
    );

    // لمبة سقف القطار (PointLight)
    const trainLight = new BABYLON.PointLight(
        'trainLight',
        new BABYLON.Vector3(
            LIGHT.trainLightPosition.x,
            LIGHT.trainLightPosition.y,
            LIGHT.trainLightPosition.z
        ),
        scene
    );
    trainLight.intensity = LIGHT.trainLightIntensity;
    trainLight.range = 5;  // distance في Three.js = range في Babylon
    trainLight.diffuse = new BABYLON.Color3(
        LIGHT.trainLightColor.r,
        LIGHT.trainLightColor.g,
        LIGHT.trainLightColor.b
    );

    // لمبة المحطة
    const stationLight = new BABYLON.PointLight(
        'stationLight',
        new BABYLON.Vector3(
            LIGHT.stationLightPosition.x,
            LIGHT.stationLightPosition.y,
            LIGHT.stationLightPosition.z
        ),
        scene
    );
    stationLight.intensity = LIGHT.stationLightIntensity;
    stationLight.range = 4;
    stationLight.diffuse = new BABYLON.Color3(
        LIGHT.stationLightColor.r,
        LIGHT.stationLightColor.g,
        LIGHT.stationLightColor.b
    );

    // لمبة تانية في القطر
    const trainLight2 = new BABYLON.PointLight(
        'trainLight2',
        new BABYLON.Vector3(
            LIGHT.trainLight2Position.x,
            LIGHT.trainLight2Position.y,
            LIGHT.trainLight2Position.z
        ),
        scene
    );
    trainLight2.intensity = LIGHT.trainLight2Intensity;
    trainLight2.range = 4;
    trainLight2.diffuse = new BABYLON.Color3(
        LIGHT.trainLight2Color.r,
        LIGHT.trainLight2Color.g,
        LIGHT.trainLight2Color.b
    );

    // لمبة خلفية للعمق
    const backLight = new BABYLON.PointLight(
        'backLight',
        new BABYLON.Vector3(
            LIGHT.backLightPosition.x,
            LIGHT.backLightPosition.y,
            LIGHT.backLightPosition.z
        ),
        scene
    );
    backLight.intensity = LIGHT.backLightIntensity;
    backLight.range = 5;
    backLight.diffuse = new BABYLON.Color3(
        LIGHT.backLightColor.r,
        LIGHT.backLightColor.g,
        LIGHT.backLightColor.b
    );

    // لمبة فوق الناس عشان ألوانهم الأصلية تظهر
    const peopleLight = new BABYLON.PointLight(
        'peopleLight',
        new BABYLON.Vector3(0.388, 0.3, -1.5),
        scene
    );
    peopleLight.intensity = LIGHT.peopleLightIntensity;
    peopleLight.range = 3;
    peopleLight.diffuse = new BABYLON.Color3(
        LIGHT.peopleLightColor.r,
        LIGHT.peopleLightColor.g,
        LIGHT.peopleLightColor.b
    );
}

/**
 * بناء الجدران من نقاط (نفس الـ logic بتاع Three.js)
 */
function buildWalls() {
    WALLS.forEach((wall, index) => {
        createWallFromPoints(
            wall.x1, wall.y1, wall.z1,
            wall.x2, wall.y2, wall.z2,
            wall.color,
            `wall_${index}`
        );
    });
}

/**
 * دالة إنشاء جدار من نقطتين (Box mesh)
 */
function createWallFromPoints(x1, y1, z1, x2, y2, z2, color, name) {
    if (!scene) return;

    const width = Math.abs(x1 - x2) || 0.1;
    const height = Math.abs(y1 - y2) || 0.1;
    const depth = Math.abs(z1 - z2) || 0.1;
    const posX = (x1 + x2) / 2;
    const posY = (y1 + y2) / 2;
    const posZ = (z1 + z2) / 2;

    // إنشاء Box في Babylon
    const wallMesh = BABYLON.MeshBuilder.CreateBox(
        name,
        { width: width, height: height, depth: depth },
        scene
    );
    wallMesh.position = new BABYLON.Vector3(posX, posY, posZ);

    // المادة (StandardMaterial = أقرب حاجة لـ MeshStandardMaterial)
    const material = new BABYLON.StandardMaterial(`${name}_mat`, scene);
    material.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
    material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // تقليل اللمعان
    wallMesh.material = material;

    // تحسين أداء: تجميد المواد الثابتة (Quest 2 optimization)
    if (QUEST2_OPTIMIZATION.freezeStaticMaterials) {
        material.freeze();
        wallMesh.freezeWorldMatrix();
    }
}

// ========================
//  فيديو الشبابيك
// ========================

let videoTexture = null;
let videoElement = null;
let windowMeshes = [];

function createWindowVideos() {
    // إنشاء عنصر فيديو HTML واحد فقط (الكل بيتقاسمه - RAM واحد!)
    videoElement = document.createElement('video');
    videoElement.src = VIDEO_PATH;
    videoElement.loop = true;
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.crossOrigin = 'anonymous';
    videoElement.style.display = 'none';
    document.body.appendChild(videoElement);

    // VideoTexture واحدة فقط (الكل بيتقاسمها - GPU memory نفسه!)
    videoTexture = new BABYLON.VideoTexture(
        'windowVideo',
        videoElement,
        scene,
        true,   // generateMipMaps
        true,   // invertY
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
        { autoPlay: false, autoUpdateTexture: true, muted: true }
    );

    // مادة واحدة بس - كل الـ planes بيستخدموها
    const videoMaterial = new BABYLON.StandardMaterial('videoMat', scene);
    videoMaterial.diffuseTexture = videoTexture;
    videoMaterial.emissiveTexture = videoTexture;
    videoMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
    videoMaterial.disableLighting = true;
    videoMaterial.backFaceCulling = false;
    videoMaterial.alpha = 0.9;

    // الارتفاع موحد لكل الفتحات
    const planeHeight = TRAIN_OPENINGS.yMax - TRAIN_OPENINGS.yMin;
    const centerY = (TRAIN_OPENINGS.yMin + TRAIN_OPENINGS.yMax) / 2;

    // 🔧 padding على عرض الـ planes عشان نضمن تغطية الشبابيك والأبواب كاملة
    const WIDTH_PADDING = 1.15; // زيادة 15% على العرض

    // كل الفتحات (أبواب + شبابيك)
    const toOpening = (o, type) => ({
    centerZ: (o.z1 + o.z2) / 2,
    width: Math.abs(o.z2 - o.z1) * WIDTH_PADDING,
    type
});
const allOpenings = [
    ...TRAIN_OPENINGS.doors.map(d => toOpening(d, 'door')),
    ...TRAIN_OPENINGS.windows.map(w => toOpening(w, 'window'))
];

    let count = 0;

    // إنشاء plane لكل فتحة على كل جانب (يمين وشمال)
    allOpenings.forEach((opening, index) => {
        // 🟢 الجانب اليمين
        const rightPlane = BABYLON.MeshBuilder.CreatePlane(
            `videoR_${opening.type}_${index}`,
            { width: opening.width, height: planeHeight, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
            scene
        );
        rightPlane.position = new BABYLON.Vector3(WINDOW_RIGHT_X, centerY, opening.centerZ);
        rightPlane.rotation.y = Math.PI / 2;
        rightPlane.rotation.x = Math.PI;
        rightPlane.material = videoMaterial;
        rightPlane.setEnabled(false);
        rightPlane.metadata = { isWindowVideo: true, openingType: opening.type };
        windowMeshes.push(rightPlane);
        count++;

        // 🟢 الجانب الشمال
        const leftPlane = BABYLON.MeshBuilder.CreatePlane(
            `videoL_${opening.type}_${index}`,
            { width: opening.width, height: planeHeight, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
            scene
        );
        leftPlane.position = new BABYLON.Vector3(WINDOW_LEFT_X, centerY, opening.centerZ);
        leftPlane.rotation.y = -Math.PI / 2;
        leftPlane.rotation.x = Math.PI;
        leftPlane.material = videoMaterial;
        leftPlane.setEnabled(false);
        leftPlane.metadata = { isWindowVideo: true, openingType: opening.type };
        windowMeshes.push(leftPlane);
        count++;
    });

    console.log(`🎥 فيديو الشبابيك والأبواب: ${count} plane (${TRAIN_OPENINGS.windows.length} شبابيك × 2 + ${TRAIN_OPENINGS.doors.length} أبواب × 2)`);
    console.log(`💾 الفيديو واحد فقط - الـ planes كلها بتتقاسمه (RAM واحد)`);
}

// ========================
// 🚂 اهتزاز الكاميرا (محاكاة حركة القطار)
// ========================
let cameraShakeObserver = null;
let shakeStartTime = 0;

/**
 * بدء اهتزاز الكاميرا - بسيط جداً وطبيعي زي قطار حقيقي
 */
function startCameraShake() {
    // لو فيه اهتزاز شغال بالفعل، متعملش حاجة
    if (cameraShakeObserver) return;

    const cam = getCamera();
    if (!scene || !cam) return;

    shakeStartTime = performance.now();

    // 🎚️ شدة الاهتزاز (لو حسيتها قوية قلل، ضعيفة زود)
    const SHAKE_AMOUNT_Y = 0.001;   // اهتزاز فوق وتحت (الأقوى)
    const SHAKE_AMOUNT_X = 0.0007;   // اهتزاز يمين وشمال (خفيف)
    const SHAKE_SPEED = 0.002;      // سرعة الاهتزاز

    // نحفظ موقع البداية عشان نضيف عليه offset (مش نغيره)
    let baseY = cam.position.y;
    let baseX = cam.position.x;
    let lastBaseY = baseY;
    let lastBaseX = baseX;

    cameraShakeObserver = scene.onBeforeRenderObservable.add(() => {
        const activeCam = getCamera(); // ممكن الكاميرا اتغيرت (VR)
        if (!activeCam) return;

        // لو الكاميرا اتحركت (اللاعب مشي)، نحدث الـ base
        if (Math.abs(activeCam.position.y - lastBaseY) > 0.01) baseY = activeCam.position.y;
        if (Math.abs(activeCam.position.x - lastBaseX) > 0.01) baseX = activeCam.position.x;

        const t = (performance.now() - shakeStartTime) * SHAKE_SPEED;

        // موجتين بتراددات مختلفة عشان الاهتزاز يبقى طبيعي مش رتيب
        const offsetY = Math.sin(t) * SHAKE_AMOUNT_Y + Math.sin(t * 1.7) * SHAKE_AMOUNT_Y * 0.5;
        const offsetX = Math.sin(t * 1.3) * SHAKE_AMOUNT_X;

        activeCam.position.y = baseY + offsetY;
        activeCam.position.x = baseX + offsetX;

        lastBaseY = activeCam.position.y;
        lastBaseX = activeCam.position.x;
    });

    console.log('🚂 اهتزاز القطار بدأ');
}

/**
 * إيقاف اهتزاز الكاميرا
 */
function stopCameraShake() {
    if (!cameraShakeObserver) return;
    if (scene) {
        scene.onBeforeRenderObservable.remove(cameraShakeObserver);
    }
    cameraShakeObserver = null;
    console.log('🚂 اهتزاز القطار وقف');
}

/**
 * تشغيل فيديو الشبابيك (muted - بدون صوت)
 */
export function playWindowVideo() {
    if (!videoElement) return;

    videoElement.play().then(() => {
        windowMeshes.forEach(plane => plane.setEnabled(true));
        startCameraShake(); // ✅ ابدأ الاهتزاز مع الفيديو
        console.log('🎥✅ فيديو الشبابيك اشتغل!');
    }).catch(e => {
        // لو فشل بسبب سياسة autoplay، نضيف مستمع لإعادة المحاولة بعد أول تفاعل
        console.warn('🎥 فشل autoplay - هيشتغل بعد أول interaction:', e.message);
        const retry = () => {
            if (!videoElement) return;
            videoElement.play().then(() => {
                windowMeshes.forEach(plane => plane.setEnabled(true));
                startCameraShake(); // ✅ ابدأ الاهتزاز مع الفيديو
                console.log('🎥✅ فيديو الشبابيك اشتغل (retry)!');
            }).catch(() => {});
            document.removeEventListener('click', retry);
            document.removeEventListener('touchstart', retry);
        };
        document.addEventListener('click', retry, { once: true });
        document.addEventListener('touchstart', retry, { once: true });
    });
}

/**
 * إيقاف فيديو الشبابيك
 */
export function stopWindowVideo() {
    if (videoElement && !videoElement.paused) {
        videoElement.pause();
        windowMeshes.forEach(plane => plane.setEnabled(false));
        stopCameraShake(); // ✅ وقّف الاهتزاز مع الفيديو
        console.log('🎥⏹️ فيديو الشبابيك توقف');
    }
}

/**
 * تنظيف موارد الفيديو
 */
export function disposeVideo() {
    stopWindowVideo();
    if (videoTexture) {
        videoTexture.dispose();
        videoTexture = null;
    }
    windowMeshes.forEach(plane => plane.dispose());
    windowMeshes = [];
    if (videoElement) {
        videoElement.remove();
        videoElement = null;
    }
}

// ========================
//  صور الحوائط
// ========================

let imageWallMeshes = [];

function createImageWalls() {
    // الصورة اليمين
    createImageWall(
        'imageWallRight',
        IMAGE_WALLS.right,
        IMAGE_WALL_POSITIONS.right,
        -Math.PI / 2  // الدوران
    );

    // الصورة الشمال
    createImageWall(
        'imageWallLeft',
        IMAGE_WALLS.left,
        IMAGE_WALL_POSITIONS.left,
        Math.PI / 2
    );

    console.log('🖼️ صور الحوائط الجانبية اتحملت');
}

function createImageWall(name, imagePath, pos, rotY) {
    const width = Math.abs(pos.zMax - pos.zMin);
    const height = pos.height || 20;
    const centerZ = (pos.zMin + pos.zMax) / 2;

    // الـ Plane
    const plane = BABYLON.MeshBuilder.CreatePlane(
        name,
        { width: width, height: height, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
        scene
    );
    plane.position = new BABYLON.Vector3(pos.x, pos.y || 3.2, centerZ);
    plane.rotation.y = rotY;
    plane.scaling = new BABYLON.Vector3(1.3, 1.3, 1); // يكبرها 30%
    
    // المادة مع الصورة (Babylon بيتعامل مع الـ color space تلقائياً)
    const material = new BABYLON.StandardMaterial(`${name}_mat`, scene);
    const texture = new BABYLON.Texture(imagePath, scene);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture; // عشان تظهر بألوانها بدون اعتماد على الإضاءة
    material.emissiveColor = new BABYLON.Color3(0.7, 0.7, 0.7);
    material.backFaceCulling = false;
    material.alpha = 0.9;
    material.useAlphaFromDiffuseTexture = true;

    plane.material = material;

    // تحسين أداء
    if (QUEST2_OPTIMIZATION.freezeStaticMaterials) {
        plane.freezeWorldMatrix();
    }

    imageWallMeshes.push(plane);
}

// ========================
//  تحسينات الأداء لـ Quest 2
// ========================

function optimizeForQuest2() {
    // تفعيل frustum culling (مفعّل تلقائياً في Babylon لكن نتأكد)
    if (QUEST2_OPTIMIZATION.enableFrustumCulling) {
        scene.skipFrustumClipping = false;
    }

    // تقليل عمليات auto-clear (نحتاجها لكن مش بمستوى عالي)
    scene.autoClear = true;
    scene.autoClearDepthAndStencil = true;

    // Block dirty mechanism for materials لتحسين الأداء
    scene.blockMaterialDirtyMechanism = false;

    // عدم محاولة تنفيذ DefaultRenderingPipeline للأداء (يضيف post-processing مكلف)
    // ممكن نضيفه لاحقاً لو احتجنا

    console.log('🚀 تحسينات Quest 2 اتفعلت');
}

// ========================
//  دوال الوصول
// ========================

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getEngine() { return engine; }
export function getCanvas() { return canvas; }

/**
 * تحديث مرجع الكاميرا (مهم لما WebXR camera تشتغل بدل الـ universal camera)
 */
export function setCamera(newCamera) {
    camera = newCamera;
}
