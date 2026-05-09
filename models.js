// models.js - تحميل وإدارة جميع الموديلات والأصوات (نسخة Babylon.js)
import { MODELS, MODEL_POSITIONS, SOUNDS } from './config.js';
import { setRoomDoorOpen } from './collision.js';
import { addTrainInteriorAgent } from './crowd.js';

// كاش للموديلات (عشان نحملها مرة واحدة بس)
let modelCache = {};

// مراجع للموديلات الهامة اللي هنحتاج نوصفلها بعدين
let ticketModel = null;
let trainModel = null;
let conductorModel = null;

// 🚪 مراجع باب الغرفة (Object_14 = مقبض، Object_15 = الباب)
let doorHandle = null;     // المقبض (Object_14)
let doorMesh = null;       // الباب (Object_15)
let isDoorOpen = false;    // حالة الباب
let isDoorAnimating = false; // علشان مش يدوس مرتين أثناء الانيميشن

// مراجع للأصوات
let wantSound = null;
let engineSound = null;
let trainSound = null;
let ticketSound = null;
let noseySound = null;

// المرجع للـ scene (هيتحط من main.js)
let sceneRef = null;

/**
 * تهيئة المحمل - في Babylon مفيش loader منفصل، بنستخدم BABYLON.SceneLoader مباشرة
 * @param {BABYLON.Scene} scene - المشهد
 */
export function initLoader(scene) {
    sceneRef = scene;
    // التأكد من إن glTF loader متاح
    if (typeof BABYLON.SceneLoader === 'undefined') {
        console.error('❌ BABYLON.SceneLoader غير متاح! تأكد من تحميل babylonjs.loaders.min.js');
    }
}

/**
 * تحميل موديل GLB مع كاش وإمكانية الاستنساخ
 * @param {string} path - مسار الموديل (مثال: 'assets/models/file.glb')
 * @returns {Promise<{rootMesh: BABYLON.AbstractMesh, meshes: Array, animationGroups: Array, skeletons: Array}>}
 */
export async function getModel(path) {
    // فصل المسار لـ folder + filename عشان BABYLON.SceneLoader
    const lastSlash = path.lastIndexOf('/');
    const folder = path.substring(0, lastSlash + 1);
    const filename = path.substring(lastSlash + 1);

    // لو مش في الكاش، حمله
    if (!modelCache[path]) {
        try {
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '',          // أسماء meshes (فاضي = كله)
                folder,
                filename,
                sceneRef
            );

            // تخزين النتيجة الأصلية في الكاش
            modelCache[path] = {
                meshes: result.meshes,
                animationGroups: result.animationGroups,
                skeletons: result.skeletons,
                particleSystems: result.particleSystems
            };

            // إخفاء الموديل الأصلي (هنستخدم clones بس)
            // نخفيه عشان لو محتاجين نستنسخه بعدين
            result.meshes.forEach(m => {
                m.setEnabled(false);
            });
        } catch (error) {
            console.error(`❌ فشل تحميل الموديل: ${path}`, error);
            throw error;
        }
    }

    // استنساخ الموديل (Babylon بيدعم cloning للـ skeletal meshes تلقائياً)
    return cloneModel(modelCache[path], path);
}

/**
 * استنساخ موديل من الكاش (مع support للـ skeletons والـ animations)
 * @param {Object} cached - الموديل من الكاش
 * @param {string} path - المسار (للـ unique naming)
 * @returns {Object} الموديل المستنسخ
 */
function cloneModel(cached, path) {
    const cloneId = `${path}_${Date.now()}_${Math.random()}`;
    const rootClone = cached.meshes[0].clone(`root_${cloneId}`, null);

    // تفعيل الـ clone
    if (rootClone) {
        rootClone.setEnabled(true);
        // تفعيل كل الـ children
        rootClone.getChildMeshes().forEach(m => m.setEnabled(true));
    }

    // استنساخ الـ animation groups (لو موجودة)
    const clonedAnimGroups = [];
    if (cached.animationGroups && cached.animationGroups.length > 0) {
        cached.animationGroups.forEach(ag => {
            const clonedAG = ag.clone(`${ag.name}_${cloneId}`, (oldTarget) => {
                // لما الـ animation group بيشتغل، يدور على الـ target الجديد في الـ clone
                return rootClone.getChildren((node) => node.name === oldTarget.name, false)[0] || oldTarget;
            });
            clonedAnimGroups.push(clonedAG);
        });
    }

    return {
        rootMesh: rootClone,
        meshes: rootClone ? [rootClone, ...rootClone.getChildMeshes()] : [],
        animationGroups: clonedAnimGroups,
        skeletons: cached.skeletons
    };
}

/**
 * Helper: تحميل موديل وتطبيق الموقع والـ scale والـ rotation
 * @param {string} path - مسار الموديل
 * @param {Object} pos - الموقع والإعدادات
 * @returns {Promise<BABYLON.AbstractMesh>}
 */
async function loadAndPlaceModel(path, pos) {
    const lastSlash = path.lastIndexOf('/');
    const folder = path.substring(0, lastSlash + 1);
    const filename = path.substring(lastSlash + 1);

    const result = await BABYLON.SceneLoader.ImportMeshAsync(
        '',
        folder,
        filename,
        sceneRef
    );

    // root mesh = أول mesh (عادة __root__ في glTF)
    const root = result.meshes[0];

    // تطبيق الموقع
    root.position.x = pos.x;
    root.position.y = pos.y;
    root.position.z = pos.z;

    // تطبيق الـ scale (مع ملاحظة: في scene.useRightHandedSystem, glTF بيتحمل صح)
    if (pos.scale !== undefined) {
        root.scaling.x = pos.scale;
        root.scaling.y = pos.scale;
        root.scaling.z = pos.scale;
    }

    // تطبيق الـ rotation حول Y
    if (pos.rotY !== undefined) {
        root.rotation.y = pos.rotY;
    }

    // إخفاء لو visible: false
    if (pos.visible === false) {
        root.setEnabled(false);
        // إخفاء كل الـ children كمان
        root.getChildMeshes().forEach(m => m.setEnabled(false));
    }

    return {
        rootMesh: root,
        meshes: result.meshes,
        animationGroups: result.animationGroups,
        skeletons: result.skeletons
    };
}

/**
 * تحميل جميع موديلات المشروع
 * @param {BABYLON.Scene} scene - المشهد لإضافة الموديلات إليه
 */
export async function loadAllModels(scene) {
    const loadPromises = [];

    // --- غرفة المحطة ---
    // ✅ ImportMeshAsync مباشرة عشان نوصل لـ result.transformNodes أيضاً
    {
        const roomPath   = MODELS.room;
        const lastSlash  = roomPath.lastIndexOf('/');
        const roomFolder = roomPath.substring(0, lastSlash + 1);
        const roomFile   = roomPath.substring(lastSlash + 1);

        loadPromises.push(
            BABYLON.SceneLoader.ImportMeshAsync('', roomFolder, roomFile, sceneRef)
                .then(result => {
                    if (!result || !result.meshes) {
                        console.error('❌ الـ room model ما اترجعتش meshes'); return;
                    }

                    // ✅ تطبيق الموقع والـ scale والـ rotation
                    // ✅ تصحيح الخطأ: scaling.x/y/z بدل setAll (مش موجودة في Babylon)
                    const root = result.meshes[0];
                    const pos  = MODEL_POSITIONS.room;
                    root.position.x = pos.x;
                    root.position.y = pos.y ?? 0;
                    root.position.z = pos.z;
                    const s = pos.scale;
                    root.scaling.x = s; root.scaling.y = s; root.scaling.z = s;
                    if (pos.rotY !== undefined) root.rotation.y = pos.rotY;

                    // ══════════════════════════════════════════════
                    //  🔍 DEBUG - شوف الـ console عشان تعرف الأسماء
                    // ══════════════════════════════════════════════
                    console.log('🔍 [room] ALL meshes:');
                    result.meshes.forEach((m, i) =>
                        console.log(`  [mesh][${i}] name="${m.name}" parent="${m.parent?.name}"`)
                    );
                    console.log('🔍 [room] ALL transformNodes:');
                    (result.transformNodes || []).forEach((tn, i) =>
                        console.log(`  [TN][${i}] name="${tn.name}" parent="${tn.parent?.name}"`)
                    );

                    // ══════════════════════════════════════════════
                    //  🚪 البحث عن Object_14 و Object_15
                    //  في 3 مراحل: meshes ← transformNodes ← scene
                    // ══════════════════════════════════════════════

                    // 1️⃣ البحث في الـ meshes
                    result.meshes.forEach(mesh => {
                        const n = mesh.name.toLowerCase();
                        if (!doorHandle && n.includes('object_14')) { doorHandle = mesh; console.log(`🚪 مقبض (mesh): "${mesh.name}"`); }
                        if (!doorMesh   && n.includes('object_15')) { doorMesh   = mesh; console.log(`🚪 باب   (mesh): "${mesh.name}"`); }
                    });

                    // 2️⃣ البحث في الـ transformNodes
                    (result.transformNodes || []).forEach(tn => {
                        const n = tn.name.toLowerCase();
                        if (!doorHandle && n.includes('object_14')) { doorHandle = tn; console.log(`🚪 مقبض (TN): "${tn.name}"`); }
                        if (!doorMesh   && n.includes('object_15')) { doorMesh   = tn; console.log(`🚪 باب   (TN): "${tn.name}"`); }
                    });

                    // 3️⃣ Fallback: البحث في الـ scene كلها
                    if (!doorHandle) { doorHandle = sceneRef.getNodeByName('Object_14'); if (doorHandle) console.log(`🚪 مقبض (scene): "${doorHandle.name}"`); }
                    if (!doorMesh)   { doorMesh   = sceneRef.getNodeByName('Object_15'); if (doorMesh)   console.log(`🚪 باب   (scene): "${doorMesh.name}"`); }

                    // ══════════════════════════════════════════════
                    //  🔑 فتح الباب: rotation +90° على parent الباب
                    // ══════════════════════════════════════════════
                    if (doorMesh) {
                        const pivot = doorMesh.parent ?? doorMesh;
                        doorPivotNode = pivot;

                        // ✅ rotate() مع Space.WORLD = نتيجة مضمونة بغض النظر عن rotation الـ parent
                        pivot.rotate(BABYLON.Axis.Y, Math.PI / 2, BABYLON.Space.WORLD);
                        console.log(`🚪✅ لفنا "${pivot.name}" +90° (world space)`);

                        // إزالة collision
                        [doorMesh, doorHandle].forEach(m => {
                            if (!m) return;
                            m.checkCollisions = false;
                            m.isPickable = false;
                            m.getChildMeshes?.().forEach(c => { c.checkCollisions = false; c.isPickable = false; });
                        });

                        isDoorOpen = true;
                        setRoomDoorOpen(true);
                        console.log('🚪✅ الباب مفتوح + collision اتشال');
                    } else {
                        // ══════════════════════════════════════════════
                        //  ⚠️ لو Object_15 مش بيتلاقى - ابحث عن "door"
                        // ══════════════════════════════════════════════
                        const allNodes = [
                            ...result.meshes,
                            ...(result.transformNodes || [])
                        ];
                        const doorNode = allNodes.find(n => n.name.toLowerCase().includes('door'));
                        if (doorNode) {
                            doorPivotNode = doorNode;
                            doorNode.rotate(BABYLON.Axis.Y, Math.PI / 2, BABYLON.Space.WORLD);
                            console.log(`🚪✅ لقينا الباب بـ "door": "${doorNode.name}" وفتحناه`);
                            doorNode.checkCollisions = false;
                            doorNode.isPickable = false;
                            isDoorOpen = true;
                            setRoomDoorOpen(true);
                        } else {
                            console.error('❌ ما لقيناش الباب خالص - افتح الـ console وشوف أسماء الـ nodes فوق');
                        }
                    }

                    if (!doorHandle) console.warn('⚠️ Object_14 (مقبض) مش موجود');
                })
                .catch(err => console.error('❌ فشل تحميل room:', err))
        );
    }

    // --- الكمبيوتر ---
    loadPromises.push(
        loadAndPlaceModel(MODELS.desktopPC, MODEL_POSITIONS.desktopPC)
            .catch(err => console.error('❌ فشل تحميل desktopPC:', err))
    );

    // --- التذكرة (مخفية في البداية) ---
    loadPromises.push(
        loadAndPlaceModel(MODELS.ticket, MODEL_POSITIONS.ticket)
            .then(result => {
                ticketModel = result.rootMesh;
            })
            .catch(err => console.error('❌ فشل تحميل ticket:', err))
    );

    // --- الراجل القاعد ---
    loadPromises.push(
        loadAndPlaceModel(MODELS.manSitting, MODEL_POSITIONS.manSitting)
            .catch(err => console.error('❌ فشل تحميل manSitting:', err))
    );

    // --- الحارس ---
    loadPromises.push(
        loadAndPlaceModel(MODELS.guard, MODEL_POSITIONS.guard)
            .catch(err => console.error('❌ فشل تحميل guard:', err))
    );

    // --- الكمسري ---
    loadPromises.push(
        loadAndPlaceModel(MODELS.conductor, MODEL_POSITIONS.conductor)
            .then(result => {
                conductorModel = result.rootMesh;
                addTrainInteriorAgent(conductorModel);   // ✅
            })
            .catch(err => console.error('❌ فشل تحميل conductor:', err))
    );

    // --- المحطة ---
    // --- المحطة ---
    // --- المحطة ---
loadPromises.push(
    loadAndPlaceModel(MODELS.station, MODEL_POSITIONS.station)
        .catch(err => console.error('❌ فشل تحميل station:', err))
);

    // --- القطار ---
    loadPromises.push(
        loadAndPlaceModel(MODELS.train, MODEL_POSITIONS.train)
            .then(result => {
                trainModel = result.rootMesh;
            })
            .catch(err => console.error('❌ فشل تحميل train:', err))
    );

    // انتظار تحميل الكل
    await Promise.all(loadPromises);
    console.log('✅ كل الموديلات اتحملت');
}

// 🔊 مرجع موديول-ليفل للـ audio engine عشان مايتشالش بالـ GC
let audioEngineRef = null;

/**
 * تحميل الأصوات - v2 API (الوحيد المتاح في Babylon 8)
 * v1 اتشال خالص في Babylon 8 - BABYLON.Engine.audioEngine بقى undefined.
 */
export async function loadSounds(scene) {
    console.log('🔊 بدء تحميل الأصوات (v2 API)...');

    // 0. تحقق من وجود v2 API
    if (typeof BABYLON.CreateAudioEngineAsync !== 'function') {
        console.error('❌ BABYLON.CreateAudioEngineAsync مش موجود! تأكد من نسخة Babylon (لازم 7.50+)');
        return;
    }
    if (typeof BABYLON.CreateSoundAsync !== 'function') {
        console.error('❌ BABYLON.CreateSoundAsync مش موجود!');
        return;
    }

    try {
        // 1. إنشاء v2 audio engine + حفظه على مستوى الموديول
        audioEngineRef = await BABYLON.CreateAudioEngineAsync();
        console.log(`🔊 AudioEngine v2 جاهز (state=${audioEngineRef.state})`);

        // 2. فتح AudioContext بعد أول تفاعل (مش await عشان مش يوقف الـ init)
        audioEngineRef.unlockAsync().then(() => {
            console.log(`🔊✅ AudioContext unlocked (state=${audioEngineRef.state})`);
        });

        // 3. تحميل الأصوات بالتوازي مع تتبع كل واحد على حدة
        const specs = [
            { key: 'want',   url: SOUNDS.want,       opts: { volume: 1.0 } },
            { key: 'engine', url: SOUNDS.engine,     opts: { volume: 1.0 } },
            { key: 'train',  url: SOUNDS.trainSound, opts: { volume: 0.8} },
            { key: 'ticket', url: SOUNDS.ticket,     opts: { volume: 1.0 } },
            { key: 'nosey',  url: SOUNDS.nosey,      opts: { volume: 0.8, loop: true } },
        ];

        const results = await Promise.allSettled(
            specs.map(s => BABYLON.CreateSoundAsync(s.key, s.url, s.opts))
        );

        let ok = 0;
        results.forEach((r, i) => {
            const s = specs[i];
            if (r.status === 'fulfilled') {
                ok++;
                console.log(`🔊 [${ok}/5] ${s.key}.mp3 جاهز ✓`);
                if (s.key === 'want')   wantSound   = r.value;
                if (s.key === 'engine') engineSound = r.value;
                if (s.key === 'train')  trainSound  = r.value;
                if (s.key === 'ticket') ticketSound = r.value;
                if (s.key === 'nosey')  noseySound  = r.value;
            } else {
                console.error(`❌ فشل تحميل ${s.key}.mp3 (${s.url}):`, r.reason?.message || r.reason);
            }
        });

        console.log(`✅ النتيجة النهائية: ${ok}/5 صوت اتحمل`);
    } catch (e) {
        console.error('❌ خطأ في تهيئة الصوت:', e);
    }
}

/**
 * إرجاع reference للـ audio engine v2 (يستخدم في safePlay)
 */
export function getAudioEngine() {
    return audioEngineRef;
}

// ========================
//  🚪 نظام فتح وقفل الباب
// ========================

// الـ pivot node (الأب اللي بنلف عليه)
let doorPivotNode = null;

/**
 * 🔑 الطريقة الصح في Babylon لـ pivot rotation:
 *    1. نعمل TransformNode فارغ في مكان المفصلة (الـ hinge)
 *    2. نخلي الباب والمقبض أبناء للـ node ده
 *    3. نلف الـ node مش الباب نفسه
 *    النتيجة: الباب بيلف حوالين المفصلة زي الباب الحقيقي
 */
function setupDoorPivots(scene) {
    if (doorPivotNode) return;

    if (!doorMesh || !doorMesh.parent) {
        console.error('❌ مفيش parent node للباب');
        return;
    }

    const glbDoorNode = doorMesh.parent; // door.002_5
    glbDoorNode.computeWorldMatrix(true);

    const worldPos = glbDoorNode.getAbsolutePosition().clone();
    const worldRot = glbDoorNode.rotation.clone();

    console.log(`🚪 door.002_5 world pos: X=${worldPos.x.toFixed(3)}, Y=${worldPos.y.toFixed(3)}, Z=${worldPos.z.toFixed(3)}`);

    // 🔑 نعمل wrapper TransformNode جديد خالص في نفس مكان door.002_5
    //    ونخلي door.002_5 ابنه - عشان نتحكم في الـ animation بالكامل
    doorPivotNode = new BABYLON.TransformNode('doorWrapperPivot', scene);
    doorPivotNode.position = worldPos.clone();
    doorPivotNode.rotation = worldRot.clone();

    // نخلي door.002_5 ابن للـ wrapper
    const prevParent = glbDoorNode.parent;
    glbDoorNode.setParent(doorPivotNode);

    // نتأكد إن door.002_5 لسه في نفس مكانه العالمي
    glbDoorNode.position = BABYLON.Vector3.Zero();
    glbDoorNode.rotation = BABYLON.Vector3.Zero();

    console.log(`🚪✅ wrapper جاهز - door.002_5 بقى ابنه`);
}

/**
 * فتح الباب مع animation حقيقي (rotation 90° من المفصلة)
 * @param {BABYLON.Scene} scene
 * @returns {boolean}
 */
export function openDoor(scene) {
    if (isDoorAnimating) { console.log('🚪 الباب لسه بيتحرك...'); return false; }
    if (isDoorOpen)       { console.log('🚪 الباب مفتوح أصلاً'); return false; }
    if (!doorMesh && !doorHandle) {
        console.warn('⚠️ مفيش باب أو مقبض');
        return false;
    }

    setupDoorPivots(scene);

    if (!doorPivotNode) {
        console.error('❌ الـ pivot node مش موجود');
        return false;
    }

    isDoorAnimating = true;

    const currentAngle = doorPivotNode.rotation.y;
    // نضيف -90° على الزاوية الحالية بتاعت الـ parent
    // لو الباب لف للداخل بدل الخارج: غير الـ - لـ +
    const TARGET_ANGLE = currentAngle - Math.PI / 2;

    const anim = new BABYLON.Animation(
        'doorOpen', 'rotation.y', 60,
        BABYLON.Animation.ANIMATIONTYPE_FLOAT,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    anim.setKeys([
        { frame: 0,  value: currentAngle },
        { frame: 60, value: TARGET_ANGLE }
    ]);

    const ease = new BABYLON.QuadraticEase();
    ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    anim.setEasingFunction(ease);

    doorPivotNode.animations = [anim];

    scene.beginAnimation(doorPivotNode, 0, 60, false, 1.0, () => {
        isDoorAnimating = false;
        isDoorOpen = true;
        setRoomDoorOpen(true);

        [doorMesh, doorHandle].forEach(m => {
            if (!m) return;
            m.checkCollisions = false;
            m.isPickable = false;
            m.getChildMeshes?.().forEach(c => {
                c.checkCollisions = false;
            });
        });

        console.log('🚪✅ الباب اتفتح! تقدر تعدي دلوقتي');
    });

    console.log(`🚪 بدء فتح الباب: ${(currentAngle*180/Math.PI).toFixed(1)}° → ${(TARGET_ANGLE*180/Math.PI).toFixed(1)}°`);
    return true;
}

/**
 * قفل الباب (يرجع لـ 0)
 * @param {BABYLON.Scene} scene
 */
export function closeDoor(scene) {
    if (isDoorAnimating || !isDoorOpen || !doorPivotNode) return false;

    isDoorAnimating = true;

    const anim = new BABYLON.Animation(
        'doorClose', 'rotation.y', 60,
        BABYLON.Animation.ANIMATIONTYPE_FLOAT,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    anim.setKeys([
        { frame: 0,  value: doorPivotNode.rotation.y },
        { frame: 60, value: 0 }
    ]);

    const ease = new BABYLON.QuadraticEase();
    ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);
    anim.setEasingFunction(ease);

    doorPivotNode.animations = [anim];

    scene.beginAnimation(doorPivotNode, 0, 60, false, 1.0, () => {
        isDoorAnimating = false;
        isDoorOpen = false;
        setRoomDoorOpen(false);
        if (doorMesh)   doorMesh.checkCollisions = true;
        if (doorHandle) doorHandle.checkCollisions = true;
        console.log('🚪 الباب قفل');
    });

    return true;
}

/**
 * تبديل حالة الباب (لو مفتوح يقفل، لو مقفول يفتح)
 * @param {BABYLON.Scene} scene
 */
export function toggleDoor(scene) {
    if (isDoorOpen) {
        return closeDoor(scene);
    } else {
        return openDoor(scene);
    }
}

/**
 * الحصول على حالة الباب (للـ collision check)
 * @returns {boolean} - true لو الباب مفتوح
 */
export function getDoorState() {
    return isDoorOpen;
}

/**
 * دوال الوصول للباب والمقبض (لو محتاجين)
 */
export function getDoorMesh() { return doorMesh; }
export function getDoorHandle() { return doorHandle; }

/**
 * دوال الوصول للموديلات والأصوات الهامة (نفس API بتاع Three.js)
 */
export function getTicketModel() { return ticketModel; }
export function getTrainModel() { return trainModel; }
export function getConductorModel() { return conductorModel; }
export function getWantSound() { return wantSound; }
export function getEngineSound() { return engineSound; }
export function getTrainSound() { return trainSound; }
export function getTicketSound() { return ticketSound; }
export function getNoseySound() { return noseySound; }

/**
 * تنظيف الكاش (للذاكرة - ممكن نستخدمه بعدين لو احتجنا)
 */
export function clearCache() {
    Object.values(modelCache).forEach(cached => {
        cached.meshes.forEach(m => m.dispose());
    });
    modelCache = {};
}