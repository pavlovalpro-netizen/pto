/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { AppState, ConstructionObject, House, Section, WorkType, Task, User, Invite, RoomType, TaskType, Room, Floor } from '../src/types.ts';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

// Стандартные виды работ и применимость
const DEFAULT_WORK_TYPES: WorkType[] = [
  {
    id: 'kladka',
    name: 'Кладка блоков',
    applicableEntityTypes: [
      'Квартира',
      'Коммерция',
      'Подвал / Техпомещение',
      'Кладовая',
      'ЛХ',
      'ЛК',
      'Коридор МОП',
      'Вестибюль',
      'Тамбур',
      'Колясочная',
    ],
    checklistTemplates: [
      '1. Исполнительная схема кладки',
      '2. Акт АОСР на армирование кладки',
      '3. Сертификаты соответствия блоков и кирпича',
      '4. Паспорта качества на растворную смесь',
    ],
  },
  {
    id: 'shtukaturka',
    name: 'Штукатурка стен',
    applicableEntityTypes: [
      'Квартира',
      'Коммерция',
      'ЛХ',
      'Коридор МОП',
      'Вестибюль',
      'Тамбур',
      'Колясочная',
    ],
    checklistTemplates: [
      '1. Акт АОСР на штукатурные работы',
      '2. Исполнительный чертеж отклонений',
      '3. Паспорт качества на сухую смесь гипсовую/цементную',
    ],
  },
  {
    id: 'styazhka',
    name: 'Стяжка пола',
    applicableEntityTypes: [
      'Квартира',
      'Коммерция',
      'ЛХ',
      'Коридор МОП',
      'Вестибюль',
      'Тамбур',
      'Колясочная',
      'Кладовая',
    ],
    checklistTemplates: [
      '1. Акт АОСР на устройство выравнивающей стяжки',
      '2. Акт АОСР на звукоизоляцию/гидроизоляцию',
      '3. Паспорта качества на сухую смесь',
      '4. Протоколы испытаний прочности раствора',
    ],
  },
  {
    id: 'shpatlevka',
    name: 'Шпатлевка стен',
    applicableEntityTypes: [
      'Квартира',
      'Коммерция',
      'ЛХ',
      'Коридор МОП',
      'Вестибюль',
      'Тамбур',
      'Колясочная',
    ],
    checklistTemplates: [
      '1. Акт приемки подготовки поверхности под отделку',
      '2. Сертификаты на финишные шпатлевки',
    ],
  },
  {
    id: 'oboi',
    name: 'Поклейка обоев',
    applicableEntityTypes: ['Квартира'],
    checklistTemplates: [
      '1. Акт контроля ровности стен после финиша',
      '2. Сертификат качества на обои',
      '3. Сертификат качества на клеевой состав',
    ],
  },
  {
    id: 'pokraska',
    name: 'Покраска',
    applicableEntityTypes: [
      'Коммерция',
      'ЛХ',
      'ЛК',
      'Коридор МОП',
      'Вестибюль',
      'Тамбур',
      'Колясочная',
    ],
    checklistTemplates: [
      '1. Акт приемки малярных финишных работ',
      '2. Сертификаты соответствия и паспорта на водно-дисперсионную краску',
    ],
  },
  {
    id: 'laminat',
    name: 'Укладка ламината',
    applicableEntityTypes: ['Квартира', 'Коммерция'],
    checklistTemplates: [
      '1. Акт приемки уложенного ламината',
      '2. Акт измерения влажности стяжки основания (допуск <4%)',
      '3. Паспорт качества на ламинированное покрытие и хвойную подложку',
    ],
  },
  {
    id: 'grilyato',
    name: 'Потолок Грильято',
    applicableEntityTypes: ['Коридор МОП', 'Вестибюль'],
    checklistTemplates: [
      '1. Акт АОСР на устройство каркаса подвесного потолка',
      '2. Паспорта на металлические подвесные ячейки и подвесы',
      '3. Сертификаты пожарной безопасности (КМ1/КМ0)',
    ],
  },
  {
    id: 'natyazhnoy',
    name: 'Натяжной потолок',
    applicableEntityTypes: ['Квартира', 'ЛХ'],
    checklistTemplates: [
      '1. Акт приемки натяжного потолка',
      '2. Сертификат на пленку ПВХ/тканевое полотно',
    ],
  },
  {
    id: 'vk_systems',
    name: 'Монтаж систем ВК',
    applicableEntityTypes: [
      'Квартира',
      'Коммерция',
      'Подвал / Техпомещение',
      'ЛХ',
      'Коридор МОП',
      'Колясочная',
    ],
    checklistTemplates: [
      '1. Акт АОСР на прокладку трубопроводов водоснабжения и канализации',
      '2. Акт гидростатического/манометрического испытания системы под давлением',
      '3. Исполнительная схема трубной разводки по точкам',
      '4. Сертификаты на полипропиленовые/ПВХ трубы и фасонные изделия',
    ],
  },
];

// Инициализируем геометрию Молжаниново
function createSeedGeometry(): { objects: ConstructionObject[]; houses: House[]; sections: Section[] } {
  const objects: ConstructionObject[] = [{ id: 'molzhaninovo', name: 'Молжаниново' }];
  const houses: House[] = [{ id: 'molzhaninovo_jd1', objectId: 'molzhaninovo', name: 'ЖД 1' }];

  // Генерируем тестовую Секция 6
  // От этажа -1 до 3
  const floors: Floor[] = [];

  // Подвал -1
  const floorNeg1Rooms: Room[] = [
    { id: 'm_jd1_s6_f-1_room_itp', type: 'Подвал / Техпомещение', name: 'ИТП (Техпомещение 1)', floorNumber: -1 },
    { id: 'm_jd1_s6_f-1_room_cl', type: 'Подвал / Техпомещение', name: 'Электрощитовая (Техпомещение 2)', floorNumber: -1 },
    { id: 'm_jd1_s6_f-1_room_stairs', type: 'ЛК', name: 'Лестничная клетка ЛК-1 (-1э)', floorNumber: -1 },
    { id: 'm_jd1_s6_f-1_room_kl1', type: 'Кладовая', name: 'Кладовая Кл-1', floorNumber: -1 },
    { id: 'm_jd1_s6_f-1_room_kl2', type: 'Кладовая', name: 'Кладовая Кл-2', floorNumber: -1 },
    { id: 'm_jd1_s6_f-1_room_kl3', type: 'Кладовая', name: 'Кладовая Кл-3', floorNumber: -1 },
    { id: 'm_jd1_s6_f-1_room_kl4', type: 'Кладовая', name: 'Кладовая Кл-4', floorNumber: -1 },
  ];
  floors.push({ floorNumber: -1, rooms: floorNeg1Rooms });

  // 1 этаж
  const floor1Rooms: Room[] = [
    { id: 'm_jd1_s6_f1_room_stairs', type: 'ЛК', name: 'Лестничная клетка ЛК-1 (1э)', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_lh', type: 'ЛХ', name: 'Лифтовой холл 1э', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_lobby', type: 'Вестибюль', name: 'Вестибюль входа', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_tamb', type: 'Тамбур', name: 'Тамбур главного входа', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_ колясочная', type: 'Колясочная', name: 'Колясочная 1э', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_comm1', type: 'Коммерция', name: 'Офис Коммерция-1', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_comm2', type: 'Коммерция', name: 'Магазин Коммерция-2', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_kv662', type: 'Квартира', name: 'кв. 662', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_kv663', type: 'Квартира', name: 'кв. 663', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_kv664', type: 'Квартира', name: 'кв. 664', floorNumber: 1 },
    { id: 'm_jd1_s6_f1_room_kv665', type: 'Квартира', name: 'кв. 665', floorNumber: 1 },
  ];
  floors.push({ floorNumber: 1, rooms: floor1Rooms });

  // 2 этаж
  const floor2Rooms: Room[] = [
    { id: 'm_jd1_s6_f2_stairs', type: 'ЛК', name: 'Лестничная клетка ЛК-1 (2э)', floorNumber: 2 },
    { id: 'm_jd1_s6_f2_lh', type: 'ЛХ', name: 'Лифтовой холл 2э', floorNumber: 2 },
    { id: 'm_jd1_s6_f2_mop', type: 'Коридор МОП', name: 'Межкв. Коридор МОП 2э', floorNumber: 2 },
  ];
  // 9 квартир сквозной нумерации (666 - 674)
  for (let q = 666; q <= 674; q++) {
    floor2Rooms.push({
      id: `m_jd1_s6_f2_room_kv${q}`,
      type: 'Квартира',
      name: `кв. ${q}`,
      floorNumber: 2,
    });
  }
  floors.push({ floorNumber: 2, rooms: floor2Rooms });

  // 3 этаж
  const floor3Rooms: Room[] = [
    { id: 'm_jd1_s6_f3_stairs', type: 'ЛК', name: 'Лестничная клетка ЛК-1 (3э)', floorNumber: 3 },
    { id: 'm_jd1_s6_f3_lh', type: 'ЛХ', name: 'Лифтовой холл 3э', floorNumber: 3 },
    { id: 'm_jd1_s6_f3_mop', type: 'Коридор МОП', name: 'Межкв. Коридор МОП 3э', floorNumber: 3 },
  ];
  // 9 квартир сквозной нумерации (675 - 683)
  for (let q = 675; q <= 683; q++) {
    floor3Rooms.push({
      id: `m_jd1_s6_f3_room_kv${q}`,
      type: 'Квартира',
      name: `кв. ${q}`,
      floorNumber: 3,
    });
  }
  floors.push({ floorNumber: 3, rooms: floor3Rooms });

  const sections: Section[] = [
    {
      id: 'molzhaninovo_jd1_s6',
      houseId: 'molzhaninovo_jd1',
      number: 'Секция 6',
      startFloor: -1,
      endFloor: 3,
      floors: floors,
    },
  ];

  return { objects, houses, sections };
}

// Генерация начальных задач (семена)
function createSeedTasks(
  objects: ConstructionObject[],
  houses: House[],
  sections: Section[]
): Task[] {
  const tasks: Task[] = [];
  const obj = objects[0];
  const house = houses[0];
  const sec = sections[0];

  // Создадим задачи для "Кладка блоков" в Подвале (-1 этаж) - их 7 штук. Все сданы!
  const podvalFloor = sec.floors.find((f) => f.floorNumber === -1)!;
  podvalFloor.rooms.forEach((room) => {
    // Получим шаблон
    const workId = 'kladka';
    const workName = 'Кладка блоков';
    const checklist: TaskChecklistItem[] = DEFAULT_WORK_TYPES.find((wt) => wt.id === workId)!.checklistTemplates.map((name, idx2) => {
      return {
        id: `chk_${room.id}_${idx2}`,
        name,
        isCompleted: true,
        driveUrl: 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz',
        comments: [
          {
            id: `comm_seed_${room.id}_${idx2}`,
            timestamp: '10.06.2026 12:45',
            username: 'Иванов И.И. (Инженер ПТО)',
            text: `Загрузил документ на диск. Проверьте, пожалуйста.`,
          },
          {
            id: `comm_seed_ok_${room.id}_${idx2}`,
            timestamp: '10.06.2026 14:15',
            username: 'Павлов М.Н. (Начальник ПТО)',
            text: `Принято.`,
          },
        ],
      };
    });

    tasks.push({
      id: `task_podval_${room.id}_kladka`,
      type: 'main',
      location: {
        objectId: obj.id,
        objectName: obj.name,
        houseId: house.id,
        houseName: house.name,
        sectionId: sec.id,
        sectionNumber: sec.number,
        floorNumber: -1,
        roomId: room.id,
        roomName: room.name,
        roomType: room.type,
      },
      workTypeId: workId,
      workTypeName: workName,
      executorName: 'Павлов М.Н.',
      executorEmail: 'pavlov.alpro@gmail.com',
      status: 7, // В архиве (Сдано) - ЗЕЛЕНЫЙ
      deadline: '2026-06-10',
      driveFolderUrl: 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz',
      checklist,
      createdAt: new Date('2026-06-01').toISOString(),
    });
  });

  // 1 этаж: кв. 662 - Штукатурка стен - На проверке у Начальника ПТО (status 3) - ОРАНЖЕВЫЙ
  const kv662 = podvalFloor; // (dummy) - but we will look up floor 1
  const floor1 = sec.floors.find((f) => f.floorNumber === 1)!;
  const r662 = floor1.rooms.find((r) => r.name === 'кв. 662')!;

  tasks.push({
    id: `task_f1_r662_shtukaturka`,
    type: 'main',
    location: {
      objectId: obj.id,
      objectName: obj.name,
      houseId: house.id,
      houseName: house.name,
      sectionId: sec.id,
      sectionNumber: sec.number,
      floorNumber: 1,
      roomId: r662.id,
      roomName: r662.name,
      roomType: r662.type,
    },
    workTypeId: 'shtukaturka',
    workTypeName: 'Штукатурка стен',
    executorName: 'Иванов И.И. (Инженер ПТО)',
    executorEmail: 'engineer1@al-pro.ru',
    status: 3, // На проверке у Начальника ПТО
    deadline: '2026-06-15',
    driveFolderUrl: 'https://drive.google.com/open?id=123-f1-r662-shtukaturka',
    checklist: [
      {
        id: 'chk_f1_r662_1',
        name: '1. Акт АОСР на штукатурные работы',
        isCompleted: true,
        driveUrl: 'https://drive.google.com/corp/sheet1',
        comments: [
          {
            id: 'sh_c1',
            timestamp: '11.06.2026 09:30',
            username: 'Иванов И.И. (Инженер ПТО)',
            text: 'Документ готов к согласованию. Прошу подписать.',
          },
        ],
      },
      {
        id: 'chk_f1_r662_2',
        name: '2. Исполнительный чертеж отклонений',
        isCompleted: true,
        driveUrl: 'https://drive.google.com/corp/drawing1',
        comments: [],
      },
      {
        id: 'chk_f1_r662_3',
        name: '3. Паспорт качества на сухую смесь гипсовую/цементную',
        isCompleted: false,
        driveUrl: '',
        comments: [],
      },
    ],
    createdAt: new Date('2026-06-03').toISOString(),
  });

  // 2 этаж: кв. 668 - Штукатурка стен - Замечания технадзора (status 5) - КРАСНЫЙ
  const floor2 = sec.floors.find((f) => f.floorNumber === 2)!;
  const r668 = floor2.rooms.find((r) => r.name === 'кв. 668')!;

  tasks.push({
    id: `task_f2_r668_shtukaturka`,
    type: 'main',
    location: {
      objectId: obj.id,
      objectName: obj.name,
      houseId: house.id,
      houseName: house.name,
      sectionId: sec.id,
      sectionNumber: sec.number,
      floorNumber: 2,
      roomId: r668.id,
      roomName: r668.name,
      roomType: r668.type,
    },
    workTypeId: 'shtukaturka',
    workTypeName: 'Штукатурка стен',
    executorName: 'Иванов И.И. (Инженер ПТО)',
    executorEmail: 'engineer1@al-pro.ru',
    status: 5, // Замечания технадзора
    deadline: '2026-06-14',
    driveFolderUrl: 'https://drive.google.com/open?id=123-f2-r668-shtukaturka',
    statusComments: 'Технадзор отклонил акт! Обнаружены отклонения от вертикали более 6мм в углу дверного проема. Необходима локальная перетирка штукатурного слоя.',
    checklist: [
      {
        id: 'chk_f2_r668_1',
        name: '1. Акт АОСР на штукатурные работы',
        isCompleted: false,
        driveUrl: '',
        comments: [
          {
            id: 'r668_c1',
            timestamp: '11.06.2026 08:30',
            username: 'Иванов И.И. (Инженер ПТО)',
            text: 'Загрузил черновик схемы отклонений, технадзор выдал устное замечание. Исправляем штукатурный слой.',
          },
        ],
      },
      {
        id: 'chk_f2_r668_2',
        name: '2. Исполнительный чертеж отклонений',
        isCompleted: false,
        driveUrl: '',
        comments: [],
      },
      {
        id: 'chk_f2_r668_3',
        name: '3. Паспорт качества на сухую смесь гипсовую/цементную',
        isCompleted: true,
        driveUrl: 'https://drive.google.com/asdf',
        comments: [],
      },
    ],
    createdAt: new Date('2026-06-05').toISOString(),
  });

  // 2 этаж: кв. 666 - Укладка ламината - Назначена (status 1) - ЖЕЛТЫЙ
  const r666 = floor2.rooms.find((r) => r.name === 'кв. 666')!;
  tasks.push({
    id: `task_f2_r666_laminat`,
    type: 'main',
    location: {
      objectId: obj.id,
      objectName: obj.name,
      houseId: house.id,
      houseName: house.name,
      sectionId: sec.id,
      sectionNumber: sec.number,
      floorNumber: 2,
      roomId: r666.id,
      roomName: r666.name,
      roomType: r666.type,
    },
    workTypeId: 'laminat',
    workTypeName: 'Укладка ламината',
    executorName: 'Петров П.П. (Инженер ПТО)',
    executorEmail: 'engineer2@al-pro.ru',
    status: 1, // Назначена
    deadline: '2026-06-25',
    driveFolderUrl: 'https://drive.google.com/open?id=123-laminat-f2-r666',
    checklist: [
      {
        id: 'chk_f2_r666_1',
        name: '1. Акт приемки уложенного ламината',
        isCompleted: false,
        driveUrl: '',
        comments: [],
      },
      {
        id: 'chk_f2_r666_2',
        name: '2. Акт измерения влажности стяжки основания (допуск <4%)',
        isCompleted: false,
        driveUrl: '',
        comments: [],
      },
      {
        id: 'chk_f2_r666_3',
        name: '3. Паспорт качества на ламинированное покрытие и хвойную подложку',
        isCompleted: false,
        driveUrl: '',
        comments: [],
      },
    ],
    createdAt: new Date('2026-06-09').toISOString(),
  });

  // Добавим одну рекламацию!
  // 3 этаж: кв. 676 - Штукатурка стен - Рекламация (Затопление) - В работе (status 2)
  const floor3 = sec.floors.find((f) => f.floorNumber === 3)!;
  const r676 = floor3.rooms.find((r) => r.name === 'кв. 676')!;

  tasks.push({
    id: `reclamation_f3_r676_leak`,
    type: 'reclamation',
    location: {
      objectId: obj.id,
      objectName: obj.name,
      houseId: house.id,
      houseName: house.name,
      sectionId: sec.id,
      sectionNumber: sec.number,
      floorNumber: 3,
      roomId: r676.id,
      roomName: r676.name,
      roomType: r676.type,
    },
    workTypeId: 'shtukaturka',
    workTypeName: 'Штукатурка стен',
    executorName: 'Иванов И.И. (Инженер ПТО)',
    executorEmail: 'engineer1@al-pro.ru',
    status: 2, // В работе
    deadline: '2026-06-18',
    driveFolderUrl: 'https://drive.google.com/open?id=reclamation-f3-r676',
    reclamationCause: 'Затопление',
    reclamationDescription: 'Прорыв временного трубопровода радиатора на 4 этаже, вода просочилась на 3 этаж, повреждена штукатурка стен и откосов в спальне кв. 676. Требуется локальное просушивание, антисептическая обработка и повторное оштукатуривание стен.',
    checklist: [
      {
        id: 'chk_rec1',
        name: '1. Дефектный акт затопления с подписями комиссии',
        isCompleted: true,
        driveUrl: 'https://drive.google.com/file_defact_676',
        comments: [
          {
            id: 'comm_rec_1',
            timestamp: '11.06.2026 10:15',
            username: 'Иванов И.И. (Инженер ПТО)',
            text: 'Акт подписан главным инженером и представителем управляющей компании. Ссылка прикреплена.',
          },
        ],
      },
      {
        id: 'chk_rec2',
        name: '2. Акт АОСР на локальное оштукатуривание',
        isCompleted: false,
        driveUrl: '',
        comments: [],
      },
    ],
    createdAt: new Date('2026-06-10').toISOString(),
  });

  return tasks;
}

export class ServerDB {
  private static initialLoad = false;
  private static state: AppState = {
    objects: [],
    houses: [],
    sections: [],
    workTypes: DEFAULT_WORK_TYPES,
    tasks: [],
    users: [],
    invites: [],
  };

  public static load(): AppState {
    if (this.initialLoad) {
      return this.state;
    }

    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        this.state = JSON.parse(raw);
        // Заполним дефолтные работы, если они вдруг пропали/отсутствуют
        if (!this.state.workTypes || this.state.workTypes.length === 0) {
          this.state.workTypes = DEFAULT_WORK_TYPES;
        }
        if (!this.state.companyName) {
          this.state.companyName = 'ООО "Ал-Про"';
        }
        if (!this.state.notifications) {
          this.state.notifications = [];
        }
        const pUser = this.state.users.find((u) => u.email === 'pavlov.alpro@gmail.com');
        if (pUser && (pUser.name.includes('А.Л.') || pUser.name === 'Павлов А.Л.' || pUser.name.includes('А. Л.'))) {
          pUser.name = pUser.name.replace('А.Л.', 'М.Н.').replace('А. Л.', 'М.Н.');
        }

        // Автоматически устанавливаем пароль "123456" всем пользователям, у которых его еще нет
        let updatedPasswords = false;
        for (const user of this.state.users) {
          if (!user.password) {
            user.password = '123456';
            updatedPasswords = true;
          }
        }
        if (updatedPasswords) {
          this.save();
        }

        this.initialLoad = true;
        return this.state;
      }
    } catch (e) {
      console.error('Error reading db.json, generating default state instead: ', e);
    }

    // Иначе инициализируем семена
    const { objects, houses, sections } = createSeedGeometry();
    const tasks = createSeedTasks(objects, houses, sections);

    // Добавляем пользователей
    const users: User[] = [
      {
        id: 'user_pavlov',
        name: 'Павлов М.Н. (Начальник ПТО)',
        email: 'pavlov.alpro@gmail.com',// Из метаданных запроса
        role: 'director',
        password: 'admin',
      },
      {
        id: 'user_engineer1',
        name: 'Иванов И.И. (Инженер ПТО)',
        email: 'engineer1@al-pro.ru',
        role: 'engineer',
        password: 'user',
      },
      {
        id: 'user_engineer2',
        name: 'Петров П.П. (Инженер ПТО)',
        email: 'engineer2@al-pro.ru',
        role: 'engineer',
        password: 'user',
      },
    ];

    // Добавляем одну активную ссылку приглашения
    const invites: Invite[] = [
      {
        token: 'invite_seed_token_123',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 часа
      },
    ];

    this.state = {
      companyName: 'ООО "Ал-Про"',
      objects,
      houses,
      sections,
      workTypes: DEFAULT_WORK_TYPES,
      tasks,
      users,
      invites,
      notifications: [],
    };

    this.save();
    this.initialLoad = true;
    return this.state;
  }

  public static save(newState?: AppState) {
    if (newState) {
      this.state = newState;
    }
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing to db.json: ', e);
    }
  }

  public static get(): AppState {
    return this.load();
  }
}
