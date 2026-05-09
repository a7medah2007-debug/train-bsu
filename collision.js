// collision.js - نظام التصادم الدقيق (Babylon.js نسخة)
// 📝 الـ logic ده pure math (مفيش Three أو Babylon API) فالتغييرات بسيطة جداً
import { COLLISION } from './config.js';

let doorsOpen = false;        // أبواب المحطة الكبيرة (للخروج)
let trainDoorsOpen = false;   // أبواب القطر
let roomDoorOpen = false;     // 🚪 باب غرفة التذاكر (Object_14 + Object_15)

/**
 * فتح أبواب المحطة (للسماح بالخروج)
 */
export function openStationDoors() {
    doorsOpen = true;
    console.log('🚪 أبواب المحطة اتفتحت!');
}

/**
 * فتح أبواب القطر (للسماح بالنزول)
 */
export function openTrainDoors() {
    trainDoorsOpen = true;
    console.log('🚪 أبواب القطر اتفتحت!');
}

/**
 * 🚪 فتح/قفل باب الغرفة (Object_14 + Object_15)
 */
export function setRoomDoorOpen(isOpen) {
    roomDoorOpen = isOpen;
    console.log(`🚪 باب الغرفة: ${isOpen ? 'مفتوح' : 'مقفول'}`);
}

/**
 * فحص التصادم الكامل - يرجع الموقع المصحح
 * @param {number} x - موقع X الحالي
 * @param {number} z - موقع Z الحالي
 * @param {number} radius - نصف قطر اللاعب (للتصادم)
 * @returns {{x: number, z: number}} الموقع المصحح
 */
export function checkCollision(x, z, radius = COLLISION.playerRadius) {
    let cx = x;
    let cz = z;

    // 1. جدران المحطة
    for (const wall of COLLISION.stationWalls) {
        const r = pushFromWall(cx, cz, radius, wall);
        cx = r.x;
        cz = r.z;
    }

    // 2. جدران غرفة التذاكر
    // 🔑 الجدار اللي عليه isDoor: true معناه ده باب الغرفة
    //    اللاعب يقدر يعدي بس لو موقعه (X) جوه نطاق فتحة الباب
    for (const wall of COLLISION.ticketRoomWalls) {
        if (wall.isDoor) {
            // افحص لو اللاعب عند الباب الفعلي (نطاق X بتاع الفتحة)
            const door = COLLISION.ticketRoomDoor;
            if (cx >= door.xMin && cx <= door.xMax) {
                continue; // اللاعب عند الفتحة - يعدي
            }
            // مش عند الفتحة - عاملها زي جدار عادي
        }
        const r = pushFromWall(cx, cz, radius, wall);
        cx = r.x;
        cz = r.z;
    }

    // 3. القطر - الحد الأيمن والأيسر
    //    🔑 لو أبواب القطر مفتوحة (trainDoorsOpen) أو أبواب المحطة (doorsOpen)،
    //       اللاعب يقدر يعدي من أي باب من الأبواب الـ5
    let blockedR = isNearWall(cx, cz, radius, COLLISION.trainRightEdge);
    let blockedL = isNearWall(cx, cz, radius, COLLISION.trainLeftEdge);

    if ((trainDoorsOpen || doorsOpen) && (blockedR || blockedL)) {
        for (const door of COLLISION.trainDoors) {
            // الباب بقى له نطاق Z (z1, z2) بدل نقطة + width
            const zMin = Math.min(door.z1, door.z2);
            const zMax = Math.max(door.z1, door.z2);
            if (cz >= zMin && cz <= zMax) {
                blockedR = false;
                blockedL = false;
                break;
            }
        }
    }

    if (blockedR) {
        const r = pushFromWall(cx, cz, radius, COLLISION.trainRightEdge);
        cx = r.x;
        cz = r.z;
    }
    if (blockedL) {
        const r = pushFromWall(cx, cz, radius, COLLISION.trainLeftEdge);
        cx = r.x;
        cz = r.z;
    }

    return { x: cx, z: cz };
}

/**
 * فحص لو اللاعب قريب من جدار
 */
function isNearWall(px, pz, radius, wall) {
    const closestX = Math.max(wall.xMin, Math.min(px, wall.xMax));
    const closestZ = Math.max(wall.zMin, Math.min(pz, wall.zMax));
    const dx = px - closestX;
    const dz = pz - closestZ;
    return Math.sqrt(dx * dx + dz * dz) < radius;
}

/**
 * دفع اللاعب بعيداً عن جدار لو اقترب
 */
function pushFromWall(px, pz, radius, wall) {
    const closestX = Math.max(wall.xMin, Math.min(px, wall.xMax));
    const closestZ = Math.max(wall.zMin, Math.min(pz, wall.zMax));
    const dx = px - closestX;
    const dz = pz - closestZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < radius && dist > 0.0001) {
        const overlap = radius - dist;
        return {
            x: px + (dx / dist) * overlap,
            z: pz + (dz / dist) * overlap
        };
    }
    return { x: px, z: pz };
}

/**
 * إعادة تعيين حالة الأبواب
 */
export function resetCollision() {
    doorsOpen = false;
    trainDoorsOpen = false;
    roomDoorOpen = false;
}

/**
 * فحص حالة الأبواب (مفيد للديباج)
 */
export function getDoorsState() {
    return { doorsOpen, trainDoorsOpen, roomDoorOpen };
}

/**
 * فحص تصادم اللاعب مع جميع الشخصيات وإرجاع الموقع المصحح
 * @param {number} px - موقع X الحالي
 * @param {number} pz - موقع Z الحالي
 * @param {number} playerRadius - نصف قطر اللاعب
 * @param {BABYLON.AbstractMesh[]} chars - قائمة شبكات الشخصيات
 * @returns {{x: number, z: number}}
 */
export function checkPlayerCharacterCollision(px, pz, playerRadius, chars) {
    let cx = px;
    let cz = pz;
    const charRadius = 0.2;
    const minDist = playerRadius + charRadius;

    for (const mesh of chars) {
        if (!mesh || !mesh.isEnabled()) continue;

        const dx = cx - mesh.position.x;
        const dz = cz - mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < minDist && dist > 0.0001) {
            const overlap = minDist - dist;
            const ndx = dx / dist;
            const ndz = dz / dist;
            cx += ndx * overlap;
            cz += ndz * overlap;
        }
    }
    return { x: cx, z: cz };
}

/**
 * حل تداخل الشخصيات مع بعضها البعض (دفع لطيف)
 * @param {number} delta - الوقت المنقضي (بالثواني)
 * @param {BABYLON.AbstractMesh[]} chars - قائمة شبكات الشخصيات
 */
export function resolveCrowdCollisions(delta, chars) {
    const charRadius = 0.2;
    const damping = 0.8;

    for (let i = 0; i < chars.length; i++) {
        for (let j = i + 1; j < chars.length; j++) {
            const a = chars[i];
            const b = chars[j];
            if (!a.isEnabled() || !b.isEnabled()) continue;

            const dx = a.position.x - b.position.x;
            const dz = a.position.z - b.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const minDist = charRadius * 2;

            if (dist < minDist && dist > 0.001) {
                const overlap = minDist - dist;
                const force = overlap * damping * 0.5;
                const ndx = dx / dist;
                const ndz = dz / dist;

                a.position.x += ndx * force;
                a.position.z += ndz * force;
                b.position.x -= ndx * force;
                b.position.z -= ndz * force;
            }
        }
    }
}
