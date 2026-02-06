'use client';

import {
    Box,
    Button,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Typography,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { useRef, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { AccountancyAttachment } from '@/lib/types';
import {
    ACCEPT_ATTACHMENTS,
    isAllowedExtension,
    isWithinSizeLimit,
    MAX_ATTACHMENTS,
} from '@/lib/accountancyAttachments';
import { uploadAccountancyAttachments } from '@/lib/uploadAccountancyAttachments';
import { useSnackbar } from '@/providers/SnackbarContext';

export default function FileAttachments(props: {
    value: AccountancyAttachment[];
    onChange: (attachments: AccountancyAttachment[]) => void;
    disabled?: boolean;
}) {
    const { value, onChange, disabled } = props;
    const { t } = useTranslation();
    const { setSnackbar } = useSnackbar();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const canAddMore = value.length < MAX_ATTACHMENTS;

    const validateFiles = (files: File[]): { valid: File[]; errors: string[] } => {
        const valid: File[] = [];
        const errors: string[] = [];
        const toAdd = MAX_ATTACHMENTS - value.length;
        let count = 0;

        for (const file of files) {
            if (count >= toAdd) {
                errors.push(t('accountancy.maxAttachmentsReached'));
                break;
            }
            if (!isAllowedExtension(file.name)) {
                errors.push(`${file.name}: ${t('accountancy.attachmentTypeNotAllowed')}`);
                continue;
            }
            if (!isWithinSizeLimit(file.size)) {
                errors.push(`${file.name}: ${t('accountancy.attachmentTooBig')}`);
                continue;
            }
            valid.push(file);
            count++;
        }

        return { valid, errors };
    };

    const handleSelectFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const input = event.target;
        const files = input.files ? Array.from(input.files) : [];
        input.value = '';

        if (!files.length) return;

        const { valid, errors } = validateFiles(files);
        if (errors.length) {
            setSnackbar({
                open: true,
                message: errors[0],
                severity: 'error',
            });
            if (valid.length === 0) return;
        }

        setUploading(true);
        try {
            const res = await uploadAccountancyAttachments(valid);
            if (res.success && res.attachments?.length) {
                onChange([...value, ...res.attachments]);
            } else if (!res.success && res.message) {
                setSnackbar({
                    open: true,
                    message: res.message,
                    severity: 'error',
                });
            }
        } catch (err) {
            console.error('Upload error:', err);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = (index: number) => {
        onChange(value.filter((_, i) => i !== index));
    };

    return (
        <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                {t('accountancy.attachments')}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                {t('accountancy.attachmentsHint')}
            </Typography>

            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT_ATTACHMENTS}
                multiple
                style={{ display: 'none' }}
                onChange={handleSelectFiles}
                disabled={disabled || uploading || !canAddMore}
            />

            {canAddMore && (
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AttachFileIcon />}
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled || uploading}
                    sx={{ mb: 1 }}
                >
                    {uploading ? '...' : t('accountancy.addFiles')}
                </Button>
            )}

            {value.length > 0 && (
                <List dense sx={{ bgcolor: 'action.hover', borderRadius: 1, py: 0 }}>
                    {value.map((att, index) => (
                        <ListItem
                            key={`${att.url}-${index}`}
                            secondaryAction={
                                !disabled && (
                                    <IconButton
                                        edge="end"
                                        size="small"
                                        onClick={() => handleRemove(index)}
                                        aria-label={t('accountancy.removeAttachment')}
                                    >
                                        <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                )
                            }
                        >
                            <ListItemText
                                primary={
                                    <Box
                                        component="a"
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        sx={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 0.5,
                                            color: 'primary.main',
                                            textDecoration: 'none',
                                            '&:hover': { textDecoration: 'underline' },
                                        }}
                                    >
                                        <InsertDriveFileIcon fontSize="small" />
                                        {att.name}
                                    </Box>
                                }
                            />
                        </ListItem>
                    ))}
                </List>
            )}
        </Box>
    );
}
