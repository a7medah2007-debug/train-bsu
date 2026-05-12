// crowd.js - إدارة الزحمة والشخصيات (Babylon.js نسخة)
import { CROWD, EVACUATION, TICKET_QUEUE, STANDING, PLATFORM_WALKERS, CHAIR_SITTERS, TRAIN_DOOR_STANDERS } from './config.js';
import { getModel } from './models.js';
import { resolveCrowdCollisions } from './collision.js';

let scene = null;
let walkers = [];
let evacuees = [];
let evacuationStarted = false;
let trainInteriorAgents = [];
let trainDeparting = false;

// مصفوفة جامعة لكل شبكات الأشخاص (للتصادم)
let allCharacterMeshes = [];
export function setTrainDeparting(active) {
    trainDeparting = active;
}

export function getAllCharacterMeshes() {
    return allCharacterMeshes;
}

function addCharacterMesh(mesh) {
    if (mesh) allCharacterMeshes.push(mesh);
}

const allSeatZ = CROWD.seatConfigs.map(s => s.z);
const walkLimitMax = Math.max(...allSeatZ) + CROWD.walkBufferZ;
const walkLimitMin = Math.min(...allSeatZ) - CROWD.walkBufferZ;
const walkerPathX = (CROWD.seatRightX + CROWD.seatLeftX) / 2;

// ============================================================
//  تهيئة الزحمة
// ============================================================

export async function initCrowd(scn) {
    scene = scn;
    walkers = [];
    evacuees = [];
    evacuationStarted = false;

    await spawnSittingPassengers();
    await spawnWalkingPassengers();
    reduceWalkers();

    // ✅ إضافة: الواقفون أمام الأبواب + الماشون + الجالسون على الرصيف
    await spawnStandingByDoors(scn);
    await spawnPlatformWalkers(scn);
    await spawnChairSitters(scn);
    await spawnTrainDoorStanders(scn);  // ✅ جديد: واقفون عند أبواب القطار من الداخل

    console.log(`✅ الزحمة جاهزة: ${walkers.length} ماشيين (وضع نادر)`);
}

async function spawnSittingPassengers() {
    const models = CROWD.sittingModels;
    if (models.length === 0) return;

    for (const seat of CROWD.seatConfigs) {
        await spawnSeatPassengers(models, CROWD.seatRightX, seat.z, CROWD.rightRotation, seat.rightCount);
        await spawnSeatPassengers(models, CROWD.seatLeftX,  seat.z, CROWD.leftRotation,  seat.leftCount);
    }
}

async function spawnSeatPassengers(models, baseX, baseZ, rotation, count) {
    if (count === 0) return;
    const spacing = CROWD.personSpacingZ;
    const startZ = baseZ - ((count - 1) * spacing) / 2;

    for (let i = 0; i < count; i++) {
        const personZ = startZ + (i * spacing);
        const modelPath = models[Math.floor(Math.random() * models.length)];
        const offsetX = (Math.random() - 0.5) * CROWD.walkerSpreadX;
        const mesh = await spawnPerson(modelPath, baseX + offsetX, CROWD.seatY, personZ, rotation, false);
        if (mesh) {
            trainInteriorAgents.push(mesh);
        }
    }
}

async function spawnWalkingPassengers() {
    const models = CROWD.walkingModels;

    // شخصان يمشيان في نفس المسار X بس بتبادل:
    // الشخص 0 يبدأ من الطرف الأمامي ويمشي نحو -Z
    // الشخص 1 يبدأ من الطرف الخلفي ويمشي نحو +Z
    // الفرق في Z بينهم دايماً نص المسار → ميخبطوش أبداً

    const halfRange = (walkLimitMax - walkLimitMin) / 2;

    for (let i = 0; i < CROWD.walkerCount; i++) {
        const modelPath = models[i % models.length];

        // الشخص الأول: يبدأ عند limitMax ويمشي نحو -Z (rotation = 0)
        // الشخص الثاني: يبدأ عند المنتصف ويمشي نحو +Z (rotation = Math.PI)
        const isSecond   = (i % 2 === 1);
        const startZ     = isSecond
            ? walkLimitMin + halfRange * 0.5          // يبدأ من ربع المسار الخلفي
            : walkLimitMax - halfRange * 0.5;         // يبدأ من ربع المسار الأمامي
        const initDir    = isSecond ? 1 : -1;         // +Z أو -Z
        // direction 1  → +Z → rotation Math.PI
        // direction -1 → -Z → rotation 0
        const initRotY   = initDir === 1 ? 0 : Math.PI;

        const mesh = await spawnPerson(modelPath, walkerPathX, 0, startZ, initRotY, true, initDir);
        if (mesh) {
            trainInteriorAgents.push(mesh);
        }
    }
}

/**
 * إنشاء شخص واحد
 * ⚠️ المشاة العاديون (isWalker=true) سيشتغل أنيميشنهم فوراً.
 *    الجالسون (isWalker=false) لا يشتغل لهم أي أنيميشن هنا -
 *    لأن الموديلات الجالسة هي idle بطبيعتها ومش محتاجين تشغيل.
 */
async function spawnPerson(modelPath, x, y, z, rotY = 0, isWalker = false, initDir = null) {
    try {
        const result = await getModel(modelPath);
        const person = result.rootMesh;
        if (!person) {
            console.warn(`⚠️ مفيش root mesh: ${modelPath}`);
            return null;
        }

        person.position.x = x;
        person.position.y = y;
        person.position.z = z;
        person.rotation.y = rotY;

        const s = CROWD.personScale;
        person.scaling = new BABYLON.Vector3(s, s, s);

        addCharacterMesh(person);

        // ✅ المشاة العاديين فقط هم اللي بيتحركوا من الأول
        if (isWalker && result.animationGroups?.length > 0) {
            result.animationGroups[0].start(true, 1.0);
        }
        // ❌ الجالسون والأشخاص الآخرون: لا أنيميشن تلقائي هنا

        if (isWalker) {
            // لو initDir مش محدد: اخترنا عشوائي، وعدّلنا الـ rotation ناحية الحركة
            const direction = initDir !== null
                ? initDir
                : (Math.random() > 0.5 ? 1 : -1);

            walkers.push({
                mesh: person,
                animationGroups: result.animationGroups || [],
                speed: CROWD.walkerSpeed,
                direction,
                limitMax: walkLimitMax,
                limitMin: walkLimitMin,
                waitTimer: Math.random() * 5,
                nextAppearTime: 0,
                isReducedMode: false
            });
        }

        return person;
    } catch (e) {
        console.error('❌ خطأ تحميل الموديل:', modelPath, e);
        return null;
    }
}

// ============================================================
//  تحديث الزحمة (يُستدعى كل فريم)
// ============================================================

export function updateCrowd(delta) {
    resolveCrowdCollisions(delta, allCharacterMeshes);

    updateEvacuees(delta);

    if (evacuationStarted) resumeAllWalkers();

    if (!trainDeparting) {
    walkers.forEach(walker => {
        if (walker.waitTimer > 0) {
            walker.waitTimer -= delta;
            walker.mesh.setEnabled(false);
            return;
        }

        if (walker.isReducedMode) {
            const now = performance.now();
            if (walker.nextAppearTime === 0) {
                walker.nextAppearTime = now +
                    CROWD.reducedWalkerIntervalMin +
                    Math.random() * (CROWD.reducedWalkerIntervalMax - CROWD.reducedWalkerIntervalMin);
                walker.mesh.setEnabled(false);
                return;
            }
            if (now < walker.nextAppearTime) {
                walker.mesh.setEnabled(false);
                return;
            }
            walker.mesh.setEnabled(true);
        } else {
            walker.mesh.setEnabled(true);
        }

        walker.mesh.position.z += walker.speed * walker.direction * delta * 60;

        if (walker.mesh.position.z >= walker.limitMax) {
            walker.mesh.position.z = walker.limitMax;
            walker.direction = -1;
            // direction -1 → يمشي نحو -Z → يبص نحو -Z = rotation 0
            walker.mesh.rotation.y = 0;
            if (walker.isReducedMode) {
                const now = performance.now();
                walker.nextAppearTime = now +
                    CROWD.reducedWalkerIntervalMin +
                    Math.random() * (CROWD.reducedWalkerIntervalMax - CROWD.reducedWalkerIntervalMin);
                walker.mesh.setEnabled(false);
                walker.mesh.position.z = walker.limitMin;
                walker.direction = 1;
                // direction 1 → يمشي نحو +Z → يبص نحو +Z = rotation Math.PI
                walker.mesh.rotation.y = Math.PI;
            }
        } else if (walker.mesh.position.z <= walker.limitMin) {
            walker.mesh.position.z = walker.limitMin;
            walker.direction = 1;
            // direction 1 → يمشي نحو +Z → يبص نحو +Z = rotation Math.PI
            walker.mesh.rotation.y = Math.PI;
            if (walker.isReducedMode) {
                const now = performance.now();
                walker.nextAppearTime = now +
                    CROWD.reducedWalkerIntervalMin +
                    Math.random() * (CROWD.reducedWalkerIntervalMax - CROWD.reducedWalkerIntervalMin);
                walker.mesh.setEnabled(false);
                walker.mesh.position.z = walker.limitMax;
                walker.direction = -1;
                // direction -1 → يمشي نحو -Z → يبص نحو -Z = rotation 0
                walker.mesh.rotation.y = Math.PI;
            }
        }
    });
    } // end if (!trainDeparting)

    // ✅ تحديث طابور التذاكر
    updateTicketQueue(delta);

    // ✅ تحديث الماشين على الرصيف
    updatePlatformWalkers(delta);
}

export function getWalkerCount() { return walkers.length; }

export function pauseAllWalkers() {
    walkers.forEach(w => w.waitTimer = 999);
}

export function resumeAllWalkers() {
    walkers.forEach(w => { if (!w.isReducedMode) w.waitTimer = 0; });
}

export function clearCrowd() {
    walkers.forEach(w => {
        if (w.mesh) {
            w.animationGroups.forEach(ag => ag.stop());
            w.mesh.dispose();
        }
    });
    walkers = [];
    allCharacterMeshes = [];
}

export function reduceWalkers() {
    for (let i = 0; i < walkers.length; i++) {
        if (i === 0) {
            walkers[i].isReducedMode = true;
            walkers[i].waitTimer = 0;
            walkers[i].nextAppearTime = 0;
            walkers[i].mesh.setEnabled(false);
        } else {
            walkers[i].mesh.setEnabled(false);
            walkers[i].waitTimer = 999999;
        }
    }
    console.log(`🚶 تحويل المشاة للنمط النادر: ${CROWD.reducedWalkerCount} ماشي`);
}

// ============================================================
//  الإخلاء
// ============================================================

export async function startEvacuation() {
    if (evacuationStarted) return;
    evacuationStarted = true;
    console.log('🚶‍♂️🚶‍♀️ بدء إخلاء 20 شخص من القطار...');

    const models = EVACUATION.peopleModels;
    const peoplePerDoor = Math.ceil(EVACUATION.totalPeople / EVACUATION.doors.length);

    for (let doorIndex = 0; doorIndex < EVACUATION.doors.length; doorIndex++) {
        const doorZ = EVACUATION.doors[doorIndex];
        const count = Math.min(
            peoplePerDoor,
            EVACUATION.totalPeople - (doorIndex * peoplePerDoor)
        );
        for (let i = 0; i < count; i++) {
            const modelPath = models[Math.floor(Math.random() * models.length)];
            const delay = Math.random() * 3000;
            setTimeout(async () => {
                const person = await spawnEvacuee(modelPath, doorZ);
                if (person) evacuees.push(person);
            }, delay);
        }
    }
}

async function spawnEvacuee(modelPath, doorZ) {
    try {
        const result = await getModel(modelPath);
        const person = result.rootMesh;
        if (!person) return null;

        const s = EVACUATION.personScale;
        person.scaling = new BABYLON.Vector3(s, s, s);
        person.position.x = EVACUATION.doorX;
        person.position.y = 0;
        person.position.z = doorZ;
        person.rotation.y = Math.PI / 2;
        person.setEnabled(true);

        addCharacterMesh(person);

        if (result.animationGroups?.length > 0) {
            result.animationGroups[0].start(true, 1.0);
        }

        return {
            mesh: person,
            animationGroups: result.animationGroups || [],
            stages: generateEvacuationPath(doorZ),
            currentStage: 0,
            speed: EVACUATION.speed,
            done: false,
            startZ: doorZ
        };
    } catch (e) {
        console.error('❌ خطأ إنشاء evacuee:', e);
        return null;
    }
}

function generateEvacuationPath(startZ) {
    const platformX = EVACUATION.platformXMin +
        Math.random() * (EVACUATION.platformXMax - EVACUATION.platformXMin);
    const gatherZ = EVACUATION.gatherZ + (Math.random() - 0.5) * EVACUATION.pathRandomness;
    const finalX = EVACUATION.finalX + (Math.random() - 0.5) * EVACUATION.finalRandomness;
    return [
        { x: platformX, z: startZ,   type: 'to_platform' },
        { x: EVACUATION.gatherX, z: gatherZ, type: 'to_gather' },
        { x: finalX, z: gatherZ,     type: 'to_final'   }
    ];
}

export function updateEvacuees(delta) {
    if (!evacuationStarted) return;
    for (let i = evacuees.length - 1; i >= 0; i--) {
        const ev = evacuees[i];
        if (ev.done) continue;
        const target = ev.stages[ev.currentStage];
        if (!target) {
            ev.mesh.setEnabled(false);
            ev.done = true;
            ev.animationGroups.forEach(ag => ag.stop());
            continue;
        }
        const dx = target.x - ev.mesh.position.x;
        const dz = target.z - ev.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < EVACUATION.arrivalDistance) {
            ev.currentStage++;
            if (ev.currentStage === 1) ev.mesh.rotation.y = (target.z > ev.mesh.position.z) ? 0 : Math.PI;
            if (ev.currentStage === 2) ev.mesh.rotation.y = (target.x > ev.mesh.position.x) ? Math.PI / 2 : -Math.PI / 2;
        } else {
            ev.mesh.position.x += (dx / dist) * ev.speed;
            ev.mesh.position.z += (dz / dist) * ev.speed;
        }
    }
}

export function stopEvacuation() {
    evacuationStarted = false;
    evacuees.forEach(ev => {
        if (ev.mesh) ev.mesh.setEnabled(false);
        ev.animationGroups.forEach(ag => ag.stop());
        ev.done = true;
    });
}

// ============================================================
//  نظام طابور التذاكر - المنقح والمُصحح بالكامل
// ============================================================

/*
  المتطلبات:
  - 3 أشخاص واقفون بلا حركة عند بدء المشروع
  - بعد 8 ثوانٍ من بدء المشروع (ليس من initTicketQueue) يبدأ الحدث:
      • الشخص 0: يمشي → الباب → توقف 0.6 ث → نقطة التجمع → يقف
      • الشخص 1: يمشي → موقع الشخص 0 الأصلي → يقف
      • الشخص 2: يمشي → موقع الشخص 1 الأصلي → يقف
  - بعد 8 ثوانٍ أخرى (من وصول الشخص 1 لموقعه):
      • الشخص 1: يمشي → الباب → توقف → نقطة التجمع → يقف
      • الشخص 2: يمشي → موقع الشخص 0 الأصلي → يقف
  - بعد 8 ثوانٍ أخرى:
      • الشخص 2: يمشي → الباب → توقف → نقطة التجمع → يقف
  - الأنيميشن يشتغل فقط أثناء المشي، ويوقف عند الوقوف
*/

let queueAgents    = [];
let queueInitialized = false;

// ✅ مؤقت داخلي للـ 8 ثواني الأولى (يبدأ من initTicketQueue)
let globalQueueTimer  = TICKET_QUEUE.waitSeconds;   // العداد الأول
let globalQueueStarted = false;                      // هل بدأ العد التنازلي؟

// مراحل الطابور: 0=أول دفعة، 1=دفعة ثانية، 2=دفعة ثالثة، 3=انتهى
let queueCycle = 0;

// مؤقت الانتظار بين الدفعات (بعد وصول آخر شخص في الدفعة السابقة)
let waitBetweenCycles = -1;   // -1 = مش شغال

export async function initTicketQueue(scn) {
    if (queueInitialized) return;

    // ✅ تأكد إن الـ scene متعيّن (لو initCrowd اتعمل قبله يبقى موجود، لو لأ عيّنه)
    if (!scene && scn) scene = scn;

    const positions = TICKET_QUEUE.positions;
    queueAgents = [];

    for (let i = 0; i < 3; i++) {
        const agent = await createQueuePerson(scn, positions[i]);
        if (agent) queueAgents.push(agent);
    }

    // ✅ ابدأ عداد الـ 8 ثواني الأولى
    globalQueueTimer   = TICKET_QUEUE.waitSeconds;
    globalQueueStarted = true;
    queueCycle         = 0;
    waitBetweenCycles  = -1;

    queueInitialized = true;
    console.log('👥 طابور التذاكر جاهز - انتظار 8 ثواني...');
}

async function createQueuePerson(scn, pos) {
    try {
        // ✅ كل شخص له instance مستقل تماماً عن طريق ImportMesh مباشرة
        // بدل getModel (اللي بيرجع cached shared mesh)
        // كل استدعاء لـ ImportMeshAsync بيرجع mesh جديد + AnimationGroups منفصلة
        const result = await BABYLON.SceneLoader.ImportMeshAsync(
            '',
            TICKET_QUEUE.model.substring(0, TICKET_QUEUE.model.lastIndexOf('/') + 1),
            TICKET_QUEUE.model.substring(TICKET_QUEUE.model.lastIndexOf('/') + 1),
            scn
        );

        const mesh = result.meshes[0];
        if (!mesh) return null;

        mesh.position.x = pos.x;
        mesh.position.y = 0;
        mesh.position.z = pos.z;
        mesh.rotation.y = TICKET_QUEUE.lookAtWhileWaiting;
        mesh.scaling    = new BABYLON.Vector3(0.4, 0.4, 0.4);
        mesh.setEnabled(true);

        // هذه الـ AnimationGroups مستقلة 100% عن باقي الأشخاص
        const ags = result.animationGroups || [];

        // ✅ تجميد تام فوري
        freezeAgent(ags, scn);

        return {
            mesh,
            animationGroups : ags,
            state           : 'idle',
            targetPos       : null,
            doorPauseTimer  : 0,
            originalPos     : { x: pos.x, z: pos.z }
        };
    } catch (e) {
        console.error('❌ خطأ تحميل شخص الطابور:', e);
        return null;
    }
}

// ============================================================
//  تحديث الطابور (يُستدعى من updateCrowd كل فريم)
// ============================================================

export function updateTicketQueue(delta) {
    if (!queueInitialized || !globalQueueStarted) return;
    if (queueAgents.length === 0) return;

    // --- 1. عداد الـ 8 ثواني الأولى ---
    if (globalQueueTimer > 0) {
        globalQueueTimer -= delta;
        if (globalQueueTimer <= 0) {
            globalQueueTimer = 0;
            triggerCycle(0);   // أول دفعة
        }
        return;   // لا تحديث للحركة قبل انتهاء العداد
    }

    // --- 2. عداد الانتظار بين الدفعات ---
    if (waitBetweenCycles > 0) {
        waitBetweenCycles -= delta;
        if (waitBetweenCycles <= 0) {
            waitBetweenCycles = -1;
            triggerCycle(queueCycle);
        }
    }

    // --- 3. تحديث حركة كل شخص ---
    queueAgents.forEach(agent => updateQueueAgent(agent, delta));

    // --- 4. فحص: هل انتهت الدفعة الحالية؟ ---
    checkCycleCompletion();
}

/**
 * تشغيل دفعة معيّنة (0, 1, 2)
 * دفعة 0: الثلاثة يتحركوا معاً في البداية
 * دفعة 1: الثاني يغادر + الثالث يتقدم
 * دفعة 2: الثالث يغادر
 */
function triggerCycle(cycle) {
    const positions = TICKET_QUEUE.positions;
    console.log(`🚶 بدء دفعة الطابور رقم ${cycle}`);

    if (cycle === 0) {
        // ── الشخص 0: يغادر للباب ──────────────────────────────
        startWalkToDoor(queueAgents[0]);

        // ── الشخص 1: يتحرك لموقع الشخص 0 الأصلي ─────────────
        startWalkToPosition(queueAgents[1], positions[0]);

        // ── الشخص 2: يتحرك لموقع الشخص 1 الأصلي ─────────────
        startWalkToPosition(queueAgents[2], positions[1]);

        queueCycle = 1;

    } else if (cycle === 1) {
        // ── الشخص 1: يغادر للباب ──────────────────────────────
        startWalkToDoor(queueAgents[1]);

        // ── الشخص 2: يتحرك لموقع الشخص 0 الأصلي ─────────────
        startWalkToPosition(queueAgents[2], positions[0]);

        queueCycle = 2;

    } else if (cycle === 2) {
        // ── الشخص 2: يغادر للباب ──────────────────────────────
        startWalkToDoor(queueAgents[2]);

        queueCycle = 3;
    }
}

/** يبدأ رحلة الشخص نحو الباب */
function startWalkToDoor(agent) {
    if (!agent || agent.state === 'done') return;
    agent.state     = 'walking_to_door';
    agent.targetPos = { x: TICKET_QUEUE.doorTarget.x, z: TICKET_QUEUE.doorTarget.z };
    playAnimation(agent);
}

/** يبدأ الشخص المشي لموقع محدد في الطابور */
function startWalkToPosition(agent, pos) {
    if (!agent || agent.state === 'done') return;
    agent.state     = 'walking_to_pos';
    agent.targetPos = { x: pos.x, z: pos.z };
    playAnimation(agent);
}

// ============================================================
//  مساعدات التجميد والتحريك
// ============================================================

/**
 * تجميد تام لمجموعة أنيميشن:
 * reset()      → يرجع للـ frame 0
 * goToFrame(0) → يثبت كل الـ bones على frame 0
 * pause()      → يمنع أي تحديث مستقبلي
 *
 * ⚠️ stop() وحده في Babylon لا يكفي لأن الـ AnimationGroup
 *    بتستمر في تطبيق آخر قيمة على الـ targets.
 *    الحل الوحيد الموثوق هو pause() بعد goToFrame.
 *
 * ⚠️ طبقة ثانية: الـ GLB loader أحياناً بيبدأ scene.animatables
 *    مستقلة (beginAnimation) - بنوقفها كمان عن طريق الـ targets.
 */
function freezeAgent(animationGroups, scn) {
    const s = scn || scene;
    animationGroups.forEach(ag => {
        // طبقة 1: إيقاف الـ AnimationGroup نفسها
        ag.stop();
        ag.reset();
        ag.goToFrame(0);
        ag.pause();

        // طبقة 2: إيقاف أي animatable مباشر على الـ targets
        if (s) {
            ag.targetedAnimations.forEach(ta => {
                const target = ta.target;
                if (target && s.getAllAnimatablesByTarget) {
                    const animatables = s.getAllAnimatablesByTarget(target);
                    animatables.forEach(a => {
                        a.pause();
                        a.goToFrame(0);
                    });
                }
            });
        }
    });
}

/** تشغيل الأنيميشن (فك التجميد الكامل) */
function playAnimation(agent) {
    if (!agent.animationGroups?.length) return;
    agent.animationGroups.forEach(ag => {
        ag.start(true, 1.0);
    });
}

/** تجميد تام بعد الوصول للهدف */
function stopAnimation(agent) {
    if (!agent.animationGroups?.length) return;
    freezeAgent(agent.animationGroups, scene);
}

// ============================================================
//  تحديث حركة شخص واحد
// ============================================================

function updateQueueAgent(agent, delta) {
    if (!agent?.mesh) return;

    switch (agent.state) {

        case 'idle':
        case 'done':
            // واقف - لا شيء
            break;

        // ── مشي نحو الباب ───────────────────────────────────
        case 'walking_to_door':
            moveTowards(agent, agent.targetPos, delta, () => {
                // وصل للباب → أوقف وابدأ توقف قصير
                agent.state          = 'door_pause';
                agent.doorPauseTimer = TICKET_QUEUE.doorPause;
                stopAnimation(agent);
                agent.mesh.rotation.y = TICKET_QUEUE.lookAtWhileWaiting;
            });
            break;

        // ── توقف عند الباب ──────────────────────────────────
        case 'door_pause':
            agent.doorPauseTimer -= delta;
            if (agent.doorPauseTimer <= 0) {
                agent.state     = 'walking_to_gather';
                agent.targetPos = { x: TICKET_QUEUE.gatherTarget.x, z: TICKET_QUEUE.gatherTarget.z };
                playAnimation(agent);
            }
            break;

        // ── مشي نحو نقطة التجمع ─────────────────────────────
        case 'walking_to_gather':
            moveTowards(agent, agent.targetPos, delta, () => {
                agent.state = 'done';
                stopAnimation(agent);
                console.log('✅ شخص وصل لنقطة التجمع ووقف');
                if (TICKET_QUEUE.vanishAfterGather) {
                    agent.mesh.setEnabled(false);
                }
            });
            break;

        // ── مشي نحو موقع في الطابور ─────────────────────────
        case 'walking_to_pos':
            moveTowards(agent, agent.targetPos, delta, () => {
                agent.state = 'idle';
                stopAnimation(agent);
                agent.mesh.rotation.y = TICKET_QUEUE.lookAtWhileWaiting;
                console.log('✅ شخص وصل لموقعه في الطابور ووقف');
            });
            break;
    }
}

// ============================================================
//  فحص انتهاء الدفعة وبدء العداد للدفعة التالية
// ============================================================

/**
 * الدفعة تُعتبر منتهية عندما يصبح كل الأشخاص المتحركين في حالة idle أو done
 * (بمعنى: مش في walking_to_door أو walking_to_gather أو walking_to_pos أو door_pause)
 */
function checkCycleCompletion() {
    // لو في انتظار بين الدفعات أو انتهى كل شيء → تجاهل
    if (waitBetweenCycles > 0 || queueCycle >= 3) return;

    // لو لسه في حركة → لا تفعل شيئاً
    const anyMoving = queueAgents.some(a =>
        a.state === 'walking_to_door' ||
        a.state === 'walking_to_gather' ||
        a.state === 'walking_to_pos' ||
        a.state === 'door_pause'
    );

    if (anyMoving) return;

    // كل الأشخاص واقفون → هل في دفعة تالية؟
    if (queueCycle === 1) {
        // دفعة 0 انتهت → استنى 8 ثواني ثم دفعة 1
        waitBetweenCycles = TICKET_QUEUE.waitSeconds;
        console.log('⏱️ انتظار 8 ثواني قبل الدفعة التالية...');
    } else if (queueCycle === 2) {
        // دفعة 1 انتهت → استنى 8 ثواني ثم دفعة 2
        waitBetweenCycles = TICKET_QUEUE.waitSeconds;
        console.log('⏱️ انتظار 8 ثواني قبل الدفعة الأخيرة...');
    }
    // queueCycle === 3 → انتهى كل شيء
}

// ============================================================
//  دالة الحركة المساعدة
// ============================================================

/**
 * يحرك الشخص خطوة واحدة نحو الهدف
 * @param {object} agent
 * @param {{x, z}} target
 * @param {number} delta - ثواني
 * @param {function} onArrival - يُستدعى عند الوصول
 */
function moveTowards(agent, target, delta, onArrival) {
    const dx   = target.x - agent.mesh.position.x;
    const dz   = target.z - agent.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // الخطوة = سرعة × وقت × مضاعف العالم (8)
    const step = TICKET_QUEUE.walkSpeed * delta * 8;

    if (dist <= step || dist < 0.02) {
        // وصل
        agent.mesh.position.x = target.x;
        agent.mesh.position.z = target.z;
        if (onArrival) onArrival();
    } else {
        // تحرك وادر ناحية الهدف
        agent.mesh.position.x += (dx / dist) * step;
        agent.mesh.position.z += (dz / dist) * step;
        // وجّه الشخص ناحية الهدف
        agent.mesh.rotation.y  = Math.atan2(dx, dz);
    }
}

// ============================================================
//  🧍 الواقفون أمام أبواب القطار + مواقع إضافية
// ============================================================

/**
 * ينشئ الواقفين على الرصيف بكفاءة عالية:
 * - getModel() يُحمّل الـ GLB مرة واحدة فقط لكل موديل (cache).
 * - createInstance() يستنسخ الـ mesh بدون إعادة تحميل → رام أقل بكثير.
 * - الموديلات الأربعة تتناوب بترتيب عشوائي على المواقع.
 */
async function spawnStandingByDoors(scn) {
    const { models, rotY, positions } = STANDING;

    // ترتيب عشوائي للمواقع
    const shuffledPositions = [...positions].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffledPositions.length; i++) {
        const pos        = shuffledPositions[i];
        const modelDef   = models[i % models.length];
        const modelPath  = modelDef.path;
        const scale      = modelDef.scale;

        try {
            // ImportMeshAsync مباشرة عشان كل شخص يبدأ بـ position نظيف
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '',
                modelPath.substring(0, modelPath.lastIndexOf('/') + 1),
                modelPath.substring(modelPath.lastIndexOf('/') + 1),
                scn
            );

            const mesh = result.meshes[0];
            if (!mesh) continue;

            mesh.position.x = pos.x;
            mesh.position.y = 0;
            mesh.position.z = pos.z;
            mesh.rotation.y = rotY;
            mesh.scaling    = new BABYLON.Vector3(scale, scale, scale);
            mesh.setEnabled(true);

            addCharacterMesh(mesh);

            // الواقفون: لا أنيميشن
            if (result.animationGroups?.length > 0) {
                result.animationGroups.forEach(ag => { ag.stop(); ag.reset(); ag.goToFrame(0); ag.pause(); });
            }

        } catch (e) {
            console.error(`❌ خطأ تحميل موديل الواقف [${i}]:`, modelPath, e);
        }
    }

    console.log(`🧍 تم إنشاء ${shuffledPositions.length} واقف على الرصيف`);
}

// ============================================================
//  🚶 الماشون على الرصيف
// ============================================================

// مصفوفة state لكل ماشٍ على الرصيف (للتحديث في كل فريم)
let platformWalkerAgents = [];

/**
 * ينشئ 6 أشخاص يمشون على الرصيف في 3 مسارات X مختلفة.
 * كل مسار شخصان يبدأن من نقطتين Z مختلفتين باتجاهين معاكسين.
 */
async function spawnPlatformWalkers(scn) {
    const { models, personScale, walkerSpeed, zMin, zMax, walkers: walkerDefs } = PLATFORM_WALKERS;

    platformWalkerAgents = [];

    for (let i = 0; i < walkerDefs.length; i++) {
        const def       = walkerDefs[i];
        const modelPath = models[i % models.length];

        try {
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '',
                modelPath.substring(0, modelPath.lastIndexOf('/') + 1),
                modelPath.substring(modelPath.lastIndexOf('/') + 1),
                scn
            );

            const mesh = result.meshes[0];
            if (!mesh) continue;

            mesh.position.x = def.x;
            mesh.position.y = 0;
            mesh.position.z = def.startZ;
            // direction 1  → يمشي نحو +Z → rotation Math.PI
            // direction -1 → يمشي نحو -Z → rotation 0
            mesh.rotation.y = def.direction === 1 ? Math.PI : 0;
            mesh.scaling    = new BABYLON.Vector3(personScale, personScale, personScale);
            mesh.setEnabled(true);

            // تشغيل أنيميشن المشي
            if (result.animationGroups?.length > 0) {
                result.animationGroups[0].start(true, 1.0);
            }

            addCharacterMesh(mesh);

            platformWalkerAgents.push({
                mesh,
                animationGroups: result.animationGroups || [],
                speed:     walkerSpeed,
                direction: def.direction,
                pathX:     def.x,
                zMin,
                zMax
            });

        } catch (e) {
            console.error(`❌ خطأ تحميل الماشي على الرصيف [${i}]:`, modelPath, e);
        }
    }

    console.log(`🚶 تم إنشاء ${platformWalkerAgents.length} ماشٍ على الرصيف`);
}

/**
 * يُستدعى كل فريم من updateCrowd.
 * يحرك كل ماشٍ ويعكس اتجاهه عند الحدود.
 */
function updatePlatformWalkers(delta) {
    platformWalkerAgents.forEach(w => {
        w.mesh.position.z += w.speed * w.direction * delta * 60;

        if (w.mesh.position.z >= w.zMax) {
            w.mesh.position.z = w.zMax;
            w.direction = -1;
            // direction -1 → نحو -Z → rotation 0
            w.mesh.rotation.y = Math.PI;
        } else if (w.mesh.position.z <= w.zMin) {
            w.mesh.position.z = w.zMin;
            w.direction = 1;
            // direction 1 → نحو +Z → rotation Math.PI
            w.mesh.rotation.y = 0;
        }
    });
}

// ============================================================
//  🚪 الواقفون عند أبواب القطار من الداخل
// ============================================================

/**
 * ينشئ أشخاصاً واقفين عند كل باب داخل القطار.
 * - كل باب فيه شخص أو شخصين على جانبي الباب
 * - X=2.95 (وسط القطار ناحية الباب) + offset صغير لليمين/يسار
 * - يبصوا ناحية الباب (rotation.y = Math.PI/2)
 */
async function spawnTrainDoorStanders(scn) {
    const { doors, models: doorStandModels, doorX, offsets, personScale, rotY } = TRAIN_DOOR_STANDERS;

    let count = 0;
    let modelIndex = 0;

    for (const door of doors) {
        for (const offset of offsets) {
            const modelPath = doorStandModels[modelIndex % doorStandModels.length];
            modelIndex++;

            try {
                const result = await BABYLON.SceneLoader.ImportMeshAsync(
                    '',
                    modelPath.substring(0, modelPath.lastIndexOf('/') + 1),
                    modelPath.substring(modelPath.lastIndexOf('/') + 1),
                    scn
                );

                const mesh = result.meshes[0];
                if (!mesh) continue;

                mesh.position.x = doorX;
                mesh.position.y = 0;
                mesh.position.z = door.z + offset;
                mesh.rotation.y = rotY;
                mesh.scaling    = new BABYLON.Vector3(personScale, personScale, personScale);
                mesh.setEnabled(true);

                // واقفون ثابتون: لا أنيميشن
                if (result.animationGroups?.length > 0) {
                    result.animationGroups.forEach(ag => { ag.stop(); ag.reset(); ag.goToFrame(0); ag.pause(); });
                }

                addCharacterMesh(mesh);
                trainInteriorAgents.push(mesh);
                count++;
            } catch (e) {
                console.error(`❌ خطأ تحميل واقف باب القطار:`, modelPath, e);
            }
        }
    }

    console.log(`🚪🧍 تم إنشاء ${count} واقف عند أبواب القطار من الداخل`);
}

// ============================================================
//  🪑 الجالسون على كراسي الرصيف
// ============================================================

/**
 * ينشئ 4 أشخاص جالسين على الكراسي الخارجية للرصيف.
 * - كل شخص يجلس على إحداثيات محددة (X=6.4، Z متنوعة).
 * - لا أنيميشن إضافي (الموديلات الجالسة idle بطبيعتها).
 */
async function spawnChairSitters(scn) {
    const { models, personScale, rotY, positions } = CHAIR_SITTERS;

    for (let i = 0; i < positions.length; i++) {
        const pos       = positions[i];
        const modelPath = models[i % models.length];   // كل شخص موديل مختلف

        try {
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '',
                modelPath.substring(0, modelPath.lastIndexOf('/') + 1),
                modelPath.substring(modelPath.lastIndexOf('/') + 1),
                scn
            );

            const mesh = result.meshes[0];
            if (!mesh) continue;

            mesh.position.x = pos.x;
            mesh.position.y = 0;
            mesh.position.z = pos.z;
            mesh.rotation.y = rotY;
            mesh.scaling    = new BABYLON.Vector3(personScale, personScale, personScale);
            mesh.setEnabled(true);

            addCharacterMesh(mesh);

            // الجالسون: لا أنيميشن إضافي
            if (result.animationGroups?.length > 0) {
                result.animationGroups.forEach(ag => { ag.stop(); ag.reset(); ag.goToFrame(0); ag.pause(); });
            }

        } catch (e) {
            console.error(`❌ خطأ تحميل الجالس [${i}]:`, modelPath, e);
        }
    }

    console.log(`🪑 تم إنشاء ${positions.length} جالسين على كراسي الرصيف`);
}

/**
 * تحريك جميع الأشخاص الواقفين داخل القطار بمقدار في Z (لمحاكاة حركة القطار)
 * @param {number} amount - المقدار المضاف إلى position.z
 */
export function shiftTrainInteriors(amount) {
    trainInteriorAgents.forEach(mesh => {
        mesh.position.z += amount;
    });
}

// ✅ إضافة عنصر إلى قائمة العناصر الداخلية التي تتحرك مع القطار
export function addTrainInteriorAgent(mesh) {
    if (mesh) {
        trainInteriorAgents.push(mesh);
    }
}
