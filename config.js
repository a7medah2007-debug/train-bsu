// config.js - جميع الثوابت والإعدادات المركزية للمشروع (Babylon.js نسخة)
// ⚠️ مهم: المشروع بيستخدم scene.useRightHandedSystem = true
// ⚠️ كل القيم مكبّرة × 8 مقارنة بالنسخة الأصلية (عشان يتناسب مع طول اللاعب في VR)

// --- إعدادات المشهد ---
export const SCENE_BACKGROUND = { r: 0.529, g: 0.808, b: 0.922 };

// --- إعدادات الكاميرا ---
export const CAMERA = {
    fov: 75 * Math.PI / 180,
    near: 0.8,
    far: 8000,
    defaultPosition: { x: 9.6, y: 1.2, z: 9.6 },
    speed: 0.4,
    rotationSensitivity: 0.1,
    latLimit: { min: -85, max: 85 },
    defaultLon: -90,
    defaultLat: 0,
    minZ: 0.8,
    maxZ: 8000
};

// --- إعدادات الإضاءة ---
export const LIGHT = {
    ambientColor: { r: 1.0, g: 0.949, b: 0.878 },
    ambientIntensity: 0.35,

    sunColor: { r: 1.0, g: 0.839, b: 0.639 },
    sunIntensity: 0.9,
    sunPosition: { x: 20.0, y: 14.4, z: 9.6 },

    trainLightColor: { r: 1.0, g: 0.702, b: 0.278 },
    trainLightIntensity: 0.3,
    trainLightPosition: { x: 3.104, y: 2.0, z: -12.0 },

    trainLight2Color: { r: 1.0, g: 0.851, b: 0.651 },
    trainLight2Intensity: 0.15,
    trainLight2Position: { x: 3.104, y: 2.4, z: -20.8 },

    stationLightColor: { r: 1.0, g: 0.945, b: 0.863 },
    stationLightIntensity: 0.5,
    stationLightPosition: { x: 9.6, y: 4.8, z: 6.4 },

    peopleLightColor: { r: 1.0, g: 1.0, b: 1.0 },
    peopleLightIntensity: 0.6,

    backLightColor: { r: 0.498, g: 0.667, b: 1.0 },
    backLightIntensity: 0.45,
    backLightPosition: { x: 3.104, y: 3.2, z: -36.0 }
};

// --- إعدادات الإنجن ---
export const ENGINE = {
    antialias: true,
    adaptToDeviceRatio: true,
    powerPreference: 'high-performance',
    stencil: true,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false
};
// --- إعدادات طابور التذاكر (الواقعي) ---
export const TICKET_QUEUE = {
    // المراكز الثلاثة من الأمام للخلف
    positions: [
        { x: 5.280, z: 5.551 },
        { x: 6.000, z: 5.526 },
        { x: 6.720, z: 5.532 }
    ],
    // وجهة ما بعد الكاونتر (الباب)
    doorTarget: { x: 7.441, z: 3.450 },
    // نقطة التجمع وانتظار القطار
    gatherTarget: { x: 7.531, z: -28.338 },
    // مدة الانتظار عند الكاونتر (بالثواني)
    waitSeconds: 8,
    // سرعة المشي (بالثواني للمتر) – تُضرب في 8 لتناسب عالمك
    walkSpeed: 0.10,     // يعادل 0.8 متر/ثانية فعلياً (مناسب)
    // موديل الشخص (نستخدم أحد المشاة)
    model: 'assets/models/passive_marker_man_walking.glb',
    // مدة توقف بسيطة عند الباب قبل متابعة المشي (للواقعية)
    doorPause: 0.6,
    // بعد ما يوصل لنقطة التجمع هل يختفي؟ (true) ولا يبقى واقفاً (false)
    vanishAfterGather: false,  // نبقيهم واقفين عشان تستنى القطر
    // اتجاه النظر عند الوقوف في الطابور (بالراديان – يبص نحو الموظف)
    lookAtWhileWaiting: -Math.PI / 2  // ينظر لـ -X تقريباً
};
// --- إعدادات الزحمة ---
export const CROWD = {
    sittingModels: [
        'assets/models/man_sitting.glb',
        'assets/models/woman_sitting_talking_kinstyuri.glb',
        'assets/models/sitting_talking.glb',
        'assets/models/sitting_man.glb'
    ],
    walkingModels: [
        'assets/models/Man-walking.glb',
        'assets/models/passive_marker_man_walking.glb'
    ],

    // --- إعدادات المقاعد (× 8) ---
    seatRightX: 2.0,
    seatLeftX: 3.824,
    seatY: 0,

    seatConfigs: [
        { z: -28.384, rightCount: 3, leftCount: 3 },  // كرسي 1
        { z: -21.192, rightCount: 3, leftCount: 3 },  // كرسي 2
        { z: -14.84,  rightCount: 1, leftCount: 3 },  // كرسي 3 - يمين عليه 1 بس
        { z: -8.52,   rightCount: 3, leftCount: 3 },  // كرسي 4
        { z: -1.192,  rightCount: 3, leftCount: 3 }   // كرسي 5
    ],

    personSpacingZ: 1.2,

    // --- المشاة (شخصان داخل القطار يتبادلان الاتجاه) ---
    walkerCount: 2,
    reducedWalkerCount: 1,
    reducedWalkerIntervalMin: 5000,
    reducedWalkerIntervalMax: 10000,
    walkerSpeed: 0.08,
    personScale: 0.4,

    // ✅ جديد: hint للـ buffer بتاع حدود المشي (× 8)
    walkBufferZ: 2.4,         // كان 0.3 في النسخة القديمة
    walkerSpreadX: 0.12,      // كان 0.015

    // --- الدوران ---
    leftRotation: Math.PI + Math.PI / 2,
    rightRotation: 0 + Math.PI / 2,
    walkerRotation: 0
};

// --- إعدادات الإخلاء ---
export const EVACUATION = {
    totalPeople: 20,
    peopleModels: [
        'assets/models/Man-walking.glb',
        'assets/models/passive_marker_man_walking.glb'
    ],
    speed: 0.12,
    personScale: 0.4,

    // ✅ جديد: مسافة الوصول للهدف (× 8)
    arrivalDistance: 0.16,    // كان 0.02
    pathRandomness: 4.0,      // كان 0.5
    finalRandomness: 2.4,     // كان 0.3

    doors: [
        1.24,
        -5.2,
        -12.08,
        -18.432,
        -24.84
    ],
    doorX: 4.44,

    platformXMin: 5.144,
    platformXMax: 5.8,
    platformZMin: -30.368,
    platformZMax: -1.2,

    gatherX: 5.8,
    gatherZ: -15.536,

    finalX: 7.592,
    finalZ: 3.488
};

// --- نصف قطر التصادم للشخصيات ---
export const CROWD_CHARACTER_RADIUS = 0.2;   // نصف قطر التصادم لكل شخص

// --- إعدادات التصادم ---
export const COLLISION = {
    playerRadius: 0.4,
    yMin: 0,

    stationWalls: [
        { xMin: 8.24,  xMax: 8.24, zMin: -30.712, zMax: 2.904 },
        { xMin: 1.088, xMax: 8.24, zMin: -31.84,  zMax: -31.84 }
    ],

    // 🔑 الجدار اللي فيه الباب علّمناه بـ isDoor: true
    //    عشان الكود يقدر يتجاهله بدون ما يحتاج يقارن بأرقام محددة
    ticketRoomWalls: [
        { xMin: 12.672, xMax: 12.672, zMin: 2.968, zMax: 10.64 },
        { xMin: 1.776,  xMax: 1.776,  zMin: 2.968, zMax: 10.64 },
        { xMin: 4.4,    xMax: 4.4,    zMin: 2.968, zMax: 8.04 },
        { xMin: 1.776,  xMax: 12.672, zMin: 10.64, zMax: 10.64 },
        { xMin: 2.968,  xMax: 12.672, zMin: 2.968, zMax: 2.968, isDoor: true }
    ],

    ticketRoomDoor: { xMin: 6.187, xMax: 8.413, zMin: 2.968, zMax: 2.968 },

    trainRightEdge: { xMin: 4.344, xMax: 4.344, zMin: -31.536, zMax: 1.168 },
    trainLeftEdge:  { xMin: 1.552, xMax: 1.552, zMin: -31.536, zMax: 1.168 },

    trainDoors: [
        { z1: 1.795,    z2: 0.6     },
        { z1: -4.727,   z2: -6      },
        { z1: -11.351,  z2: -12.519 },
        { z1: -17.872,  z2: -19.115 },
        { z1: -24.520,  z2: -25.584 }
    ],
    trainDoorWidth: 1.6,

    // ✅ جديد: tolerance لباب القطر (× 8 من 0.05)
    doorTolerance: 0.4
};

// --- مسارات الموديلات ---
export const MODELS = {
    room: 'assets/models/room_empty.glb',
    desktopPC: 'assets/models/desktop_computer.glb',
    ticket: 'assets/models/ticket.glb',
    manSitting: 'assets/models/a_man_sitting.glb',
    guard: 'assets/models/low_poly_security_guard_2.glb',
    conductor: 'assets/models/conductor_polar_express_gamecube.glb',
    station: 'assets/models/station.glb',
    train: 'assets/models/trainsubway_insides.glb'
};

// --- إحداثيات ومواقع الموديلات الثابتة ---
export const MODEL_POSITIONS = {
    room: { x: 7.2, y: 0, z: 6.72, scale: 0.8, rotY: Math.PI / 2 },
    desktopPC: { x: 3.92, y: 1.28, z: 5.752, scale: 1.2, rotY: -Math.PI / 2 },
    ticket: { x: 4.48, y: 1.04, z: 5.68, scale: 0.00024, visible: false },
    manSitting: { x: 3.44, y: 0.8, z: 5.6, scale: 0.64, rotY: -Math.PI / 2 },
    guard: { x: 7.752, y: 0, z: 4.8, scale: 0.8 },
   station: { x: 0, y: 0, z: 0, scale: 8, rotY: 0 },
   conductor: { x: 2.92, y: 0, z: -31.332, scale: 0.7, rotY: 0 },
    train: { x: 3.384, y: 0, z: 3.552, scale: 3.2, rotY: Math.PI / 2 }
};

// --- إحداثيات هامة للمراحل ---
export const EMPLOYEE = { x: 4.304, z: 5.568 };
export const EMPLOYEE_DISTANCE_THRESHOLD = 2.0;
export const TICKET_PICKUP = { x: 4.408, y: 1.04, z: 5.68 };
export const TICKET_PICKUP_DISTANCE = 0.64;
export const TICKET_DELAY = 7000;
export const ENGINE_DELAY = 15000;
export const TRAIN_SOUND_DELAY = 25000;

// --- إعدادات الفيديو ---
// 🎬 كل الفتحات (شبابيك + أبواب) - كل واحدة هتاخد plane مستقلة
//    عشان جودة الفيديو تبقى عالية في كل مكان (بدل ما يتمد على القطار كله)
//    كلهم بيتقاسموا نفس الـ video element والـ VideoTexture (RAM = نفسه)
export const TRAIN_OPENINGS = {
    // الارتفاع موحد لكل الفتحات
    yMin: 0.8,
    yMax: 1.7,

    // الأبواب (5)
    doors: [
    { z1: 1.795,    z2: 0.6     },
    { z1: -4.727,   z2: -6      },
    { z1: -11.351,  z2: -12.519 },
    { z1: -17.872,  z2: -19.115 },
    { z1: -24.520,  z2: -25.584 }
],

    // الشبابيك (10)
    windows: [
        { z1: -30.216, z2: -28.790 },
        { z1: -27.967, z2: -26.440 },
        { z1: -23.760, z2: -22.100 },
        { z1: -21.455, z2: -19.800 },
        { z1: -17.156, z2: -15.570 },
        { z1: -14.845, z2: -13.320 },
        { z1: -10.720, z2: -9.000  },
        { z1: -8.300,  z2: -6.795  },
        { z1: -4.010,  z2: -2.575  },
        { z1: -1.860,  z2: -0.180  }
    ]
};

// قديم - مازال موجود للتوافق مع كود تاني (مش هيستخدم في عرض الفيديو)
export const VIDEO_CONFIG = {
    yMin: 0,
    yMax: 2.184,
    zMin: -33.048,
    zMax: 1.232
};

export const WINDOW_RIGHT_X = 4.592;
export const WINDOW_LEFT_X = 1.52;
export const TICKET_COUNTER = { x: 3.92, z: 5.752 };
export const TICKET_DISTANCE_THRESHOLD = 6.4;

export const IMAGE_WALLS = {
    right: 'assets/image/view.png',
    left: 'assets/image/view2.png'
};

// --- مسارات الأصوات ---
export const SOUNDS = {
    want: 'assets/sounds/order.mp3',
    engine: 'assets/sounds/engine.mp3',
    trainSound: 'assets/sounds/train.mp3',
    ticket: 'assets/sounds/ticket.mp3',
    nosy: 'assets/sounds/nosy.mp3'  
};

export const VIDEO_PATH = 'assets/videos/view.mp4';
export const VIDEO_DURATION = 197000;

export const IMAGE_WALL_POSITIONS = {
    right: { x: 14.4,  y: 5, zMin: -33.016, zMax: 2.568, height: 20 },
    left:  { x: -18.4, y: 5, zMin: -33.016, zMax: 2.568, height: 20 }
};
export const TRAIN_STOP_TIME = 229;

export const CONDUCTOR = {
    startX: 2.92,
    startZ: -31.332,
    endZ: 1.384,
    walkSpeed: 0.16,
    stopDuration: 2000,
    ticketWaitDuration: 7000,
    ticketAppearDistance: 1.6,
    seatZStops: [-28.384, -21.192, -14.84, -8.52, -1.192]
};

export const WALLS = [
    {
        x1: 8.24,    y1: 5.032, z1: -33.472,
        x2: -13.768, y2: 0,     z2: -32.0,
        color: { r: 0.667, g: 0.667, b: 0.667 }
    },
    {
        x1: -14.544, y1: 5.056, z1: 2.92,
        x2: 4.4,     y2: 0,     z2: 2.92,
        color: { r: 0.333, g: 0.333, b: 0.333 }
    }
];

// --- إعدادات Quest 2 للأداء ---
export const QUEST2_OPTIMIZATION = {
    hardwareScalingLevel: 1.0,
    foveationLevel: 2,
    fixedFoveation: 0.3,
    textureCompression: true,
    enableFrustumCulling: true,
    freezeStaticMaterials: true,
    targetFPS: 72
};

// --- 🚪 إعدادات الباب التفاعلي ---
export const ROOM_DOOR = {
    centerX: 7.168,
    centerZ: 2.968,
    autoOpenDistance: 4.0,
    autoCloseDistance: 9.6,
    autoCloseEnabled: false,
    animationDuration: 1000
};

// ============================================================
// --- 🧍 الواقفون على الرصيف (أمام الأبواب + مواقع إضافية) ---
// ============================================================
// 4 موديلات تتناوب عشوائياً - الـ instance reuse يقلل استهلاك الرام
// rotY: Math.PI → يواجهون القطار (ناحية -X)
// المواقع: 2 لكل باب (X مختلف) + مواقع إضافية مبعثرة بين الأبواب
export const STANDING = {
    models: [
        { path: 'assets/models/manstanding.glb',  scale: 0.8},
        { path: 'assets/models/standingman.glb',  scale: 0.8},
        { path: 'assets/models/womanstand.glb',   scale: 0.4 },
        
    ],
    rotY: 0,          // اتجاه الواقفين على الرصيف (يواجهون القطار)
    // ترتيب الموديلات عشوائي (index % 4 يدور على الأربعة)
    // X في نطاق الرصيف (5.02–6)، متباعدون بما يكفي لمنع التقاطع البصري
    positions: [
        // ── أمام الأبواب الخمسة (2 لكل باب) ──
        // باب 1: z وسط ≈ 1.197
        { x: 5.12, z:  1.197 },
        { x: 5.58, z:  1.197 },
        // باب 2: z وسط ≈ -5.363
        { x: 5.20, z: -5.363 },
        { x: 5.65, z: -5.363 },
        // باب 3: z وسط ≈ -11.935
        { x: 5.10, z: -11.935 },
        { x: 5.55, z: -11.935 },
        // باب 4: z وسط ≈ -18.493
        { x: 5.25, z: -18.493 },
        { x: 5.70, z: -18.493 },
        // باب 5: z وسط ≈ -25.052
        { x: 5.15, z: -25.052 },
        { x: 5.60, z: -25.052 },
        // ── مواقع إضافية بين الأبواب ──
        { x: 5.35, z:  -2.5  },
        { x: 5.80, z:  -2.5  },
        { x: 5.20, z:  -8.5  },
        { x: 5.70, z:  -8.5  },
        { x: 5.40, z: -15.0  },
        { x: 5.85, z: -15.0  },
        { x: 5.30, z: -21.5  },
        { x: 5.75, z: -21.5  }
    ]
};

// ============================================================
// --- 🚶 الماشون على الرصيف ---
// ============================================================
// الرصيف: X: 5.02–6 ، Z: 1.748 إلى -22
// 3 مشاة فقط، كل واحد في مسار X مستقل تماماً → لا تقاطع ممكن
export const PLATFORM_WALKERS = {
    models: [
        'assets/models/Man-walking.glb',
        'assets/models/passive_marker_man_walking.glb'
    ],
    personScale: 0.4,
    walkerSpeed: 0.07,
    zMin: -22.0,
    zMax:  1.748,
    // مسار واحد لكل ماشٍ → الشخص لا يصادف أحداً أبداً في نفس الخط
    walkers: [
        { x: 5.18, startZ:  1.5,  direction: -1 },
        { x: 5.48, startZ: -8.0,  direction:  1 },
        { x: 5.82, startZ: -16.0, direction: -1 }
    ]
};

// ============================================================
// --- 🪑 الجالسون على كراسي الرصيف ---
// ============================================================
// 4 كراسي بـ X=6.4 وZ المحددة
// rotY = -Math.PI/2 → يواجهون القطار (180° من الوضع السابق)
export const CHAIR_SITTERS = {
    models: [
        
        'assets/models/woman_sitting_talking_kinstyuri.glb',
        'assets/models/sitting_talking.glb',
        'assets/models/sitting_man.glb'
    ],
    personScale: 0.4,
    rotY: -Math.PI / 2,
    positions: [
        { x: 6.4, z:  0.2  },
        { x: 6.4, z: -0.2  },
        { x: 6.4, z: -12.2 },
        { x: 6.4, z: -13.0 }
    ]
};
// ============================================================
// --- 🚪 الواقفون عند أبواب القطار من الداخل ---
// ============================================================
export const TRAIN_DOOR_STANDERS = {
    personScale: 0.4,                // حجم الشخص
    rotY: -Math.PI / 2,              // اتجاه النظر (ناحية الباب / +X خارج القطار)
    doorX: 3.6,                      // موضع X (قريب من الباب الأيمن)
    offsets: [-0.5, 0.5],            // offset في Z لكل شخصين في الباب
    models: [
        'assets/models/manstanding.glb',
        'assets/models/standingman.glb',
        'assets/models/womanstand.glb'
    ],
    doors: [
        { z: (1.795  + 0.6)          / 2 },   // باب 1
        { z: (-4.727 + -6)           / 2 },   // باب 2
        { z: (-11.351 + -12.519)     / 2 },   // باب 3
        { z: (-17.872 + -19.115)     / 2 },   // باب 4
        { z: (-24.520 + -25.584)     / 2 }    // باب 5
    ]
};

// --- إعدادات مغادرة القطار تلقائياً ---
export const TRAIN_DEPARTURE = {
    delayAfterDoorsOpen: 20,   // ثواني الانتظار بعد فتح أبواب المحطة
    acceleration: 3,        // تسارع القطار (متر/ثانية²)
    maxSpeed: 10,             // السرعة القصوى (متر/ثانية)
    targetEndZ: 4        // آخر نقطة من القطار يجب أن تصل إلى Z=2.5
};
