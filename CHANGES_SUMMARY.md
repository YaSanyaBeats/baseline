# Резюме изменений: Внутренние объекты

## Обзор

Реализована система внутренних (виртуальных) объектов для учёта расходов и доходов по «HolyCowPhuket внутренний объект» в целом. Объект «HolyCowPhuket внутренний объект» и его филиалы не удаляются при синхронизации с Beds24.

## Ключевые решения

1. **Отдельная коллекция**: `internalObjects` — не затрагивается при синхронизации
2. **Отрицательные ID**: `-1` (HolyCowPhuket внутренний объект), `-2`, `-3`, ... (филиалы) — исключает конфликты с Beds24
3. **Объединение данных**: функции `getObjects()` и `getAllObjects()` автоматически объединяют объекты из обеих коллекций
4. **Идемпотентность**: инициализацию можно вызывать многократно без дубликатов

## Новые файлы

### Серверная логика
```
src/lib/server/internalObjects.ts
```
- `initializeInternalObjects()` — инициализация объекта "HolyCowPhuket внутренний объект"
- `getInternalObjects()` — получение всех внутренних объектов
- `addCompanyBranch()` — добавление филиала
- `removeCompanyBranch()` — удаление филиала
- `renameCompanyBranch()` — переименование филиала

### API endpoints
```
src/app/api/internalObjects/init/route.ts
src/app/api/internalObjects/branches/route.ts
```
- `POST /api/internalObjects/init` — инициализация (только admin)
- `POST /api/internalObjects/branches` — добавить филиал (только admin)
- `PUT /api/internalObjects/branches` — переименовать филиал (только admin)
- `DELETE /api/internalObjects/branches` — удалить филиал (только admin)

### UI
```
src/app/dashboard/internalObjects/page.tsx
```
Страница администратора для:
- Инициализации объекта "HolyCowPhuket внутренний объект"
- Просмотра списка филиалов
- Управления филиалами (добавление, редактирование, удаление)

### Документация
```
INTERNAL_OBJECTS.md
INTERNAL_OBJECTS_QUICK_START.md
CHANGES_SUMMARY.md (этот файл)
```

## Модифицированные файлы

### 1. `src/lib/server/getObjects.ts`
**Изменения**:
```typescript
// Было: только objects из Beds24
const objects = await collection.find({}).sort({ name: 1 }).toArray();

// Стало: объединение objects + internalObjects
const beds24Objects = await collection.find({}).sort({ name: 1 }).toArray();
const internalObjectsRaw = await getInternalObjects();
const objects = [...internalObjectsRaw, ...beds24Objects];
```

**Функции**: `getObjects()`, `getAllObjects()`

### 2. `src/app/api/objects/route.ts`
**Изменения**: добавлена поддержка поиска по отрицательным ID
```typescript
// Для запросов id[], userID
const internalObjectsCollection = db.collection('internalObjects');
const beds24Objects = await collection.find({ id: { $in: idsNumbers } }).toArray();
const internalObjects = await internalObjectsCollection.find({ id: { $in: idsNumbers } }).toArray();
const objects = [...internalObjects, ...beds24Objects];
```

### 3. `src/app/api/analytics/route.ts`
**Изменения**: поддержка внутренних объектов в аналитике
```typescript
const internalObjectsCollection = db.collection('internalObjects');
const beds24Objects = await objectCollection.find({ id: { $in: objectIDs } }).toArray();
const internalObjects = await internalObjectsCollection.find({ id: { $in: objectIDs } }).toArray();
const objects = [...internalObjects, ...beds24Objects];
```

### 4. `src/app/api/bysuness/route.ts`
**Изменения**: поиск объектов в обеих коллекциях
```typescript
let neededObject = await objects.find({ id: +objectID }).toArray();
if (!neededObject || neededObject.length === 0) {
    neededObject = await internalObjectsCollection.find({ id: +objectID }).toArray();
}
```

### 5. `src/components/leftMenu/MiniDrawer.tsx`
**Изменения**: добавлен пункт меню "Внутренние объекты"
```typescript
import { Business } from '@mui/icons-material';

{ 
    text: t('menu.internalObjects'), 
    icon: <Business fontSize="small" />, 
    link: '/dashboard/internalObjects',
    roles: ['admin']
}
```

### 6. Переводы
**`src/i18n/translations/ru.json`**:
- `menu.internalObjects` — "Внутренние объекты"
- Раздел `internalObjects` с полным набором переводов

**`src/i18n/translations/en.json`**:
- `menu.internalObjects` — "Internal Objects"
- Раздел `internalObjects` с полным набором переводов

## API изменения

### Новые endpoints

| Метод | URL | Доступ | Описание |
|-------|-----|--------|----------|
| POST | `/api/internalObjects/init` | admin | Инициализация объекта "HolyCowPhuket внутренний объект" |
| POST | `/api/internalObjects/branches` | admin | Добавить филиал |
| PUT | `/api/internalObjects/branches` | admin | Переименовать филиал |
| DELETE | `/api/internalObjects/branches` | admin | Удалить филиал |

### Модифицированные endpoints

| Метод | URL | Изменения |
|-------|-----|-----------|
| GET | `/api/objects` | Поддержка отрицательных ID в параметрах `id[]` и `userID` |
| POST | `/api/analytics` | Поддержка объектов с отрицательными ID |
| GET | `/api/bysuness` | Поиск в обеих коллекциях по `objectID` |

## База данных

### Новая коллекция: `internalObjects`

**Структура документа**:
```json
{
  "_id": ObjectId("..."),
  "id": -1,
  "name": "HolyCowPhuket внутренний объект",
  "type": "company",
  "roomTypes": [
    {
      "units": [
        {
          "id": -2,
          "name": "Главный офис"
        },
        {
          "id": -3,
          "name": "Филиал в Москве"
        }
      ]
    }
  ]
}
```

**Индексы** (рекомендуется):
```javascript
db.internalObjects.createIndex({ id: 1 }, { unique: true })
db.internalObjects.createIndex({ type: 1 })
```

### Изменения в существующих коллекциях

**Нет изменений** в структуре коллекций:
- `objects` — без изменений, по-прежнему синхронизируется с Beds24
- `expenses` — без изменений, поддерживает `objectId: -1`
- `incomes` — без изменений, поддерживает `objectId: -1`
- `reports` — без изменений, поддерживает `objectId: -1`
- `users` — без изменений, поддерживает привязку к объектам с отрицательными ID

## Совместимость

### Обратная совместимость
✅ **Полная обратная совместимость**:
- Все существующие расходы/доходы/отчёты продолжают работать
- Синхронизация с Beds24 не затронута
- Пользователи без прав admin не видят изменений

### Миграция
❌ **Миграция не требуется**:
- Внутренние объекты — дополнительная функциональность
- Существующие данные не нужно изменять
- Коллекция `internalObjects` создаётся автоматически при первой инициализации

## Тестирование

### Юнит-тесты (рекомендуется добавить)

```typescript
// src/lib/server/internalObjects.test.ts
describe('initializeInternalObjects', () => {
  it('should create company object with default branch', async () => {
    // ...
  });
  
  it('should be idempotent', async () => {
    // Вызов дважды не должен создать дубликаты
  });
});

describe('addCompanyBranch', () => {
  it('should add branch with negative ID', async () => {
    // ...
  });
});
```

### Интеграционные тесты

```typescript
// src/app/api/internalObjects/init/route.test.ts
describe('POST /api/internalObjects/init', () => {
  it('should require admin role', async () => {
    // ...
  });
  
  it('should create company object', async () => {
    // ...
  });
});
```

### Ручное тестирование

1. ✅ Инициализация объекта "HolyCowPhuket внутренний объект" через UI
2. ✅ Добавление/редактирование/удаление филиалов
3. ✅ Создание расхода с `objectId: -1`
4. ✅ Создание дохода с `objectId: -1`
5. ✅ Синхронизация с Beds24 (объект "HolyCowPhuket внутренний объект" не удаляется)
6. ✅ Фильтрация и поиск объектов
7. ✅ Аналитика и отчёты с внутренними объектами

## Потенциальные проблемы

### 1. Производительность
**Проблема**: Объединение двух коллекций может быть медленным при большом количестве объектов.

**Решение**: 
- Добавить кэширование результата `getObjects()`
- Создать индексы на поле `id` в обеих коллекциях

### 2. Конфликт ID
**Проблема**: Если Beds24 когда-либо начнёт использовать отрицательные ID.

**Решение**: 
- Маловероятно, т.к. Beds24 использует автоинкремент с 1
- При необходимости можно перейти на диапазон 900001+

### 3. Удаление филиала с существующими расходами
**Проблема**: После удаления филиала расходы с его ID останутся в системе.

**Решение**: 
- Текущая реализация: расходы сохраняются (безопасно)
- Альтернатива: добавить проверку перед удалением филиала

## Переменные окружения

### Новые переменные
```env
# Название объекта "HolyCowPhuket внутренний объект" (опционально, по умолчанию "HolyCowPhuket внутренний объект")
COMPANY_NAME=HolyCowPhuket внутренний объект
```

## Зависимости

### Новые зависимости
❌ Нет новых зависимостей

### Существующие зависимости
- MongoDB >= 4.0 (поддержка коллекций и агрегаций)
- Next.js >= 13 (API routes и Server Components)
- Material-UI >= 5 (UI компоненты)

## Развёртывание

### Шаги развёртывания

1. **Обновить код**:
   ```bash
   git pull origin main
   npm install  # если были изменения в package.json (нет в этом случае)
   ```

2. **Перезапустить приложение**:
   ```bash
   npm run build
   npm run start
   # или с PM2
   pm2 restart app-name
   ```

3. **Инициализация** (выполняется один раз):
   - Войти под admin
   - Перейти в "Внутренние объекты"
   - Нажать "Инициализировать объект «Компания»"

4. **Проверка**:
   ```bash
   # Проверить коллекцию
   mongo your-database --eval "db.internalObjects.find().pretty()"
   
   # Запросить объекты через API
   curl http://your-domain/api/objects
   ```

### Откат изменений

Если нужно откатить изменения:

1. **Удалить коллекцию** (опционально):
   ```javascript
   db.internalObjects.drop()
   ```

2. **Откатить код**:
   ```bash
   git revert <commit-hash>
   # или
   git checkout previous-version
   ```

3. **Перезапустить приложение**

⚠️ **Внимание**: Если уже есть расходы/доходы с `objectId: -1`, при откате они останутся в базе, но не будут отображаться корректно.

## Мониторинг

### Метрики для отслеживания

1. **Количество внутренних объектов**:
   ```javascript
   db.internalObjects.count()
   ```

2. **Расходы/доходы по компании**:
   ```javascript
   db.expenses.count({ objectId: -1 })
   db.incomes.count({ objectId: -1 })
   ```

3. **Использование в отчётах**:
   ```javascript
   db.reports.count({ objectId: -1 })
   ```

## Контрольный список

### Перед развёртыванием
- [ ] Код проверен и протестирован
- [ ] Переводы добавлены для всех языков
- [ ] Права доступа настроены корректно (только admin)
- [ ] Документация актуальна

### После развёртывания
- [ ] Выполнена инициализация объекта "HolyCowPhuket внутренний объект"
- [ ] Создан тестовый расход с `objectId: -1`
- [ ] Проверена синхронизация с Beds24
- [ ] Проверена работа аналитики и отчётов
- [ ] Пользователи проинформированы о новой функциональности

### Мониторинг
- [ ] Настроен мониторинг коллекции `internalObjects`
- [ ] Настроены алерты на ошибки API
- [ ] Проверяется корректность объединения объектов

## Дополнительные ресурсы

- **Полная документация**: `INTERNAL_OBJECTS.md`
- **Быстрый старт**: `INTERNAL_OBJECTS_QUICK_START.md`
- **API Reference**: см. раздел "API Reference" в `INTERNAL_OBJECTS.md`

---

**Версия**: 1.0  
**Дата**: 06.02.2026  
**Автор**: AI Assistant  
**Статус**: Готово к развёртыванию
