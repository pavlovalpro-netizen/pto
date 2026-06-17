/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RoomType =
  | 'Квартира'
  | 'Коммерция'
  | 'Подвал / Техпомещение'
  | 'Кладовая'
  | 'ЛХ'
  | 'ЛК'
  | 'Коридор МОП'
  | 'Вестибюль'
  | 'Тамбур'
  | 'Колясочная';

export const ALL_ROOM_TYPES: RoomType[] = [
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
];

export interface Room {
  id: string;
  type: RoomType;
  name: string; // Номер или название (например, кв. 662, ЛХ)
  floorNumber: number;
}

export interface Floor {
  floorNumber: number;
  rooms: Room[];
}

export interface Section {
  id: string; // ID секции, например Молжаниново_ЖД1_Секция6
  houseId: string;
  number: string; // например: "Секция 6"
  startFloor: number;
  endFloor: number;
  floors: Floor[];
}

export interface House {
  id: string;
  objectId: string;
  name: string; // например: "ЖД 1"
}

export interface ConstructionObject {
  id: string;
  name: string; // например: "Молжаниново"
}

export interface WorkType {
  id: string;
  name: string; // Кладка блоков, Штукатурка стен, Укладка ламината, и т.д.
  applicableEntityTypes: RoomType[]; // Матрица применимости к сущностям
  checklistTemplates: string[]; // Шаблон документов (Исполнительная схема, Акт АОСР и т.д.)
}

export interface TaskComment {
  id: string;
  timestamp: string; // формат ISO или ДД.ММ.ГГГГ ЧЧ:ММ
  username: string;
  text: string;
  isCompleted?: boolean; // Отметка выполнения конкретного комментария (перечеркивание)
}

export interface TaskChecklistItem {
  id: string;
  name: string; // Название документа, например "1. Исполнительная схема"
  isCompleted: boolean;
  driveUrl: string;
  comments: TaskComment[];
}

export type TaskType = 'main' | 'reclamation' | 'general';

export interface Task {
  id: string;
  type: TaskType;
  // Локация задачи (может быть null для общих поручений)
  location: {
    objectId: string;
    objectName: string;
    houseId: string;
    houseName: string;
    sectionId: string;
    sectionNumber: string;
    floorNumber?: number;
    roomId?: string;
    roomName?: string;
    roomType?: RoomType;
  } | null;
  workTypeId: string; // Ссылка на справочник работ (для main и reclamation)
  workTypeName: string; // Денормализованное имя для удобства
  executorName: string;
  executorEmail: string;
  status: number; // 1-7: Назначена(1) ➔ В работе(2) ➔ На проверке у Начальника ПТО(3) ➔ Передано технадзору(4) ➔ Замечания технадзора(5) ➔ На подписании(6) ➔ В архиве(7)
  deadline: string; // ГГГГ-ММ-ДД
  reclamationCause?: string; // Причина рекламации: Затопление, Прорыв кровли, Брак
  reclamationDescription?: string; // Описание инцидента
  driveFolderUrl: string; // Ссылка на общую папку на Google Диске
  checklist: TaskChecklistItem[];
  statusComments?: string; // Большое текстовое поле «Текст замечания» при статусе 5 (Замечания технадзора)
  generalComment?: string; // Большое текстовое поле для общего комментария в карточке задачи после чек-листа
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'director' | 'engineer';
  password?: string;
}

export interface Invite {
  token: string;
  expiresAt: string; // ISO String
  usedByEmail?: string;
}

export interface PTONotification {
  id: string;
  senderName: string;
  senderEmail: string;
  recipientEmail: string; // email matching the recipient, or "all"
  taskId?: string;
  taskTitle?: string;
  text: string;
  createdAt: string; // ISO формат
  isRead: boolean;
}

export interface AppState {
  companyName?: string; // Название компании ПТО (например: ООО "Ал-Про")
  objects: ConstructionObject[];
  houses: House[];
  sections: Section[];
  workTypes: WorkType[];
  tasks: Task[];
  users: User[];
  invites: Invite[];
  notifications?: PTONotification[];
}
