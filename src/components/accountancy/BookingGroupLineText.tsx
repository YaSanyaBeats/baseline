'use client';

import { Fragment } from 'react';
import { Box, Tooltip, Typography, type TypographyProps } from '@mui/material';
import {
    BOOKING_GROUP_COMMENT_MAX,
    type BookingGroupLineModel,
} from '@/lib/bookingGroupLine';

const defaultGroupHeaderTypographySx: TypographyProps['sx'] = {
    fontSize: '0.7rem',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    color: 'inherit',
};

export function BookingGroupLineText({
    line,
    typographySx = defaultGroupHeaderTypographySx,
}: {
    line: BookingGroupLineModel;
    /** Совпадает с заголовком группы брони на /dashboard/accountancy */
    typographySx?: TypographyProps['sx'];
}) {
    const longCommentForTooltip =
        line.commentFull != null && line.commentFull.length > BOOKING_GROUP_COMMENT_MAX
            ? line.commentFull
            : null;

    return (
        <Typography component="span" sx={typographySx}>
            {line.segments
                .map((seg, i) => ({ seg, i }))
                .filter(({ seg }) => seg.trim() !== '')
                .map(({ seg, i }, idx) => (
                    <Fragment key={i}>
                        {idx > 0 ? ' · ' : null}
                        {i === 7 && longCommentForTooltip != null ? (
                            <Tooltip
                                title={longCommentForTooltip}
                                enterDelay={200}
                                slotProps={{
                                    tooltip: {
                                        sx: {
                                            maxWidth: 480,
                                            whiteSpace: 'pre-wrap',
                                        },
                                    },
                                }}
                            >
                                <Box component="span" sx={{ display: 'inline' }}>
                                    {seg}
                                </Box>
                            </Tooltip>
                        ) : (
                            <span>{seg}</span>
                        )}
                    </Fragment>
                ))}
        </Typography>
    );
}
