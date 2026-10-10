'use client';

import { useEffect, useState } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import type { AppLanguage } from '@/lib/accountancyCategoryResolve';

type LastUpdate = { userName: string; timestamp: string };

function formatLogDate(value: Date | string | undefined, language: AppLanguage): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(language === 'en' ? 'en-GB' : 'ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function TransactionLogTooltipBody({
    entity,
    entityId,
    authorName,
    createdAt,
    updatedAt,
    updatedByName,
    t,
    language,
}: {
    entity: 'expense' | 'income';
    entityId: string;
    authorName?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    updatedByName?: string;
    t: (key: string) => string;
    language: AppLanguage;
}) {
    const [lastUpdate, setLastUpdate] = useState<LastUpdate | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        const params = new URLSearchParams({ entity, entityId });
        fetch(`/api/auditLogs/last-update?${params.toString()}`)
            .then(async (res) => {
                if (!res.ok) return null;
                const json = (await res.json()) as { success?: boolean; data?: LastUpdate | null };
                if (!json.success) return null;
                return json.data ?? null;
            })
            .then((data) => {
                if (!cancelled) setLastUpdate(data);
            })
            .catch(() => {
                if (!cancelled) setLastUpdate(null);
            });
        return () => {
            cancelled = true;
        };
    }, [entity, entityId]);

    const fromDocument: LastUpdate | null = updatedAt
        ? { userName: updatedByName?.trim() || '—', timestamp: String(updatedAt) }
        : null;
    const shown = lastUpdate === undefined ? fromDocument : (lastUpdate ?? fromDocument);
    const waiting = lastUpdate === undefined && !fromDocument;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, py: 0.25 }}>
            <Typography variant="caption" component="div" sx={{ color: 'inherit', lineHeight: 1.35 }}>
                {t('accountancy.transactionLogAuthor')}: {authorName?.trim() || '—'}
            </Typography>
            <Typography variant="caption" component="div" sx={{ color: 'inherit', lineHeight: 1.35 }}>
                {t('accountancy.transactionLogCreated')}: {formatLogDate(createdAt, language)}
            </Typography>
            {waiting ? (
                <Typography variant="caption" component="div" sx={{ color: 'inherit', lineHeight: 1.35 }}>
                    {t('accountancy.transactionLogLoading')}
                </Typography>
            ) : shown ? (
                <>
                    <Typography variant="caption" component="div" sx={{ color: 'inherit', lineHeight: 1.35 }}>
                        {t('accountancy.transactionLogUpdated')}: {formatLogDate(shown.timestamp, language)}
                    </Typography>
                    <Typography variant="caption" component="div" sx={{ color: 'inherit', lineHeight: 1.35 }}>
                        {t('accountancy.transactionLogUpdatedBy')}: {shown.userName}
                    </Typography>
                </>
            ) : (
                <Typography variant="caption" component="div" sx={{ color: 'inherit', lineHeight: 1.35 }}>
                    {t('accountancy.transactionLogNeverEdited')}
                </Typography>
            )}
        </Box>
    );
}

export default function TransactionLogHint(props: {
    entity: 'expense' | 'income';
    entityId: string;
    authorName?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    updatedByName?: string;
    t: (key: string) => string;
    language: AppLanguage;
}) {
    return (
        <Tooltip
            title={<TransactionLogTooltipBody {...props} />}
            arrow
            placement="top"
            enterDelay={200}
            slotProps={{
                tooltip: { sx: { maxWidth: 280, px: 1.25, py: 0.75 } },
            }}
        >
            <Box
                component="span"
                sx={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    color: 'text.secondary',
                    cursor: 'help',
                    userSelect: 'none',
                    lineHeight: 1,
                    px: 0.25,
                }}
            >
                LOG
            </Box>
        </Tooltip>
    );
}
