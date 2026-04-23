# Миграции данных

## `migratePropertyObjectIdsToRoomTypeIds`

После перехода на модель «одна строка в UI = один `roomType`» старые записи могли хранить **ID property** (поле `id` документа в Mongo `objects`). Нужно перепривязать их к **ID первого элемента `roomTypes[0]`** того же property.

### Что обновляется

- `users.objects[].id`
- `expenses` (`objectId`, строки `source` / `recipient` вида `room:objectId:roomId`)
- `incomes` (аналогично)
- `reports.objectId`
- `counterparties.roomLinks[].id`
- `cashflows.roomLinks[].id`
- `cashflowRules` → `filters[].roomLinks[].id`
- `autoAccountingRules.objectId` (числовой, не `'all'`)
- `options` с `optionName: 'excludeObjects'` (массив ID)
- `auditLogs.metadata.objectId`

Функцию `migratePropertyObjectIdsToRoomTypeIds` при необходимости можно вызвать из серверного кода (скрипт, админ-утилита), передав `Db` и опции `dryRun` / `verbose`.

### Важно

- Карта строится по коллекции **`objects`** (синхронизация Beds24): для каждого property берётся **`roomTypes[0].id`**.
- Внутренние объекты (`internalObjects`, отрицательные ID) в этой карте не участвуют; их ID не меняются.
- Повторный запуск безопасен: уже заменённые ID не входят в карту как ключи и остаются как есть.

### Код движка автоучёта

После миграции правила могут хранить **roomType id**; `autoAccountingEngine` сопоставляет их с `booking.propertyId` через карту `roomType → property`.
