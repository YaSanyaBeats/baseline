'use client';

import {
    Box,
    Link,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { FAQ_SECTIONS, FAQ_TITLE, type FaqBlock } from './faqContent';

const protectedSurfaceSx = {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    MozUserSelect: 'none',
    msUserSelect: 'none',
    WebkitTouchCallout: 'none',
    '& img': {
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserDrag: 'none',
    },
} as const;

function blockFaqClipboard(event: Event) {
    event.preventDefault();
}

function FaqBlocks({ blocks }: { blocks: FaqBlock[] }) {
    return (
        <>
            {blocks.map((block, index) => {
                if (block.kind === 'p' || block.kind === 'note') {
                    return (
                        <Typography
                            key={index}
                            variant="body2"
                            color={block.kind === 'note' ? 'text.secondary' : 'text.primary'}
                            sx={{ mt: 1.5, lineHeight: 1.65, fontSize: '0.95rem' }}
                        >
                            {block.text}
                        </Typography>
                    );
                }
                if (block.kind === 'qa') {
                    return (
                        <Box key={index} sx={{ mt: 2.5 }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 650, lineHeight: 1.4 }}>
                                {block.q}
                            </Typography>
                            {block.paragraphs.map((paragraph) => (
                                <Typography
                                    key={paragraph}
                                    variant="body2"
                                    sx={{ mt: 0.75, lineHeight: 1.65, fontSize: '0.95rem' }}
                                >
                                    {paragraph}
                                </Typography>
                            ))}
                        </Box>
                    );
                }
                if (block.kind === 'list' || block.kind === 'ol') {
                    const Tag = block.kind === 'ol' ? 'ol' : 'ul';
                    return (
                        <Box
                            key={index}
                            component={Tag}
                            sx={{
                                mt: 1,
                                mb: 0,
                                pl: 2.5,
                                '& li': { mt: 0.75, lineHeight: 1.65, fontSize: '0.95rem' },
                            }}
                        >
                            {block.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </Box>
                    );
                }
                if (block.kind === 'table') {
                    return (
                        <TableContainer key={index} sx={{ mt: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        {block.headers.map((header) => (
                                            <TableCell
                                                key={header}
                                                sx={{ fontWeight: 650, fontSize: '0.75rem', whiteSpace: 'nowrap', bgcolor: 'action.hover' }}
                                            >
                                                {header}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {block.rows.map((row) => (
                                        <TableRow key={row.join('|')}>
                                            {row.map((cell, cellIndex) => (
                                                <TableCell key={cellIndex} sx={{ fontSize: '0.8125rem', verticalAlign: 'top' }}>
                                                    {cell}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    );
                }
                return (
                    <Box
                        key={block.src}
                        sx={{
                            position: 'relative',
                            mt: 2,
                            borderRadius: 1,
                            overflow: 'hidden',
                            border: '1px solid',
                            borderColor: 'divider',
                            lineHeight: 0,
                        }}
                    >
                        <Image
                            src={block.src}
                            alt={block.alt}
                            width={block.width}
                            height={block.height}
                            draggable={false}
                            style={{ width: '100%', height: 'auto', pointerEvents: 'none' }}
                        />
                        <Box aria-hidden sx={{ position: 'absolute', inset: 0 }} />
                    </Box>
                );
            })}
        </>
    );
}

export default function OwnerFaq() {
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            const key = event.key.toLowerCase();
            if (key !== 'a' && key !== 'c' && key !== 'x') return;
            const active = document.activeElement;
            if (active instanceof Node && root.contains(active)) {
                event.preventDefault();
            }
        };

        const onCopy = (event: ClipboardEvent) => {
            const selection = document.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            for (let index = 0; index < selection.rangeCount; index += 1) {
                const range = selection.getRangeAt(index);
                const hitsFaq =
                    root.contains(range.startContainer) ||
                    root.contains(range.endContainer) ||
                    range.intersectsNode(root);
                if (hitsFaq) {
                    event.preventDefault();
                    return;
                }
            }
        };

        root.addEventListener('copy', blockFaqClipboard);
        root.addEventListener('cut', blockFaqClipboard);
        root.addEventListener('dragstart', blockFaqClipboard);
        document.addEventListener('copy', onCopy);
        document.addEventListener('cut', onCopy);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            root.removeEventListener('copy', blockFaqClipboard);
            root.removeEventListener('cut', blockFaqClipboard);
            root.removeEventListener('dragstart', blockFaqClipboard);
            document.removeEventListener('copy', onCopy);
            document.removeEventListener('cut', onCopy);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    return (
        <Box
            ref={rootRef}
            onContextMenu={(event) => event.preventDefault()}
            sx={{ maxWidth: 980, ...protectedSurfaceSx }}
        >
            <Typography variant="h4" sx={{ fontWeight: 650, letterSpacing: '-0.02em' }}>
                {FAQ_TITLE}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Практика компании на октябрь 2026 года
            </Typography>

            <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 650, mb: 1 }}>
                    Содержание
                </Typography>
                <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mt: 0.5 } }}>
                    {FAQ_SECTIONS.map((section) => (
                        <li key={section.id}>
                            <Link href={`#${section.id}`} underline="hover" color="inherit" sx={{ fontSize: '0.95rem' }}>
                                {section.title}
                            </Link>
                        </li>
                    ))}
                </Box>
            </Paper>

            {FAQ_SECTIONS.map((section) => (
                <Box
                    key={section.id}
                    id={section.id}
                    component="section"
                    sx={{ mt: 4, scrollMarginTop: (theme) => theme.spacing(12) }}
                >
                    <Typography variant="h5" sx={{ fontWeight: 650, fontSize: '1.25rem' }}>
                        {section.title}
                    </Typography>
                    <FaqBlocks blocks={section.blocks} />
                </Box>
            ))}
        </Box>
    );
}
