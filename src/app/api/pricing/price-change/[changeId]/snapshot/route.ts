import { snapshotResponse } from '@/lib/pricing/effectHttp';

export async function GET(_request: Request, ctx: { params: Promise<{ changeId: string }> }) {
    const { changeId } = await ctx.params;
    return snapshotResponse(changeId);
}
