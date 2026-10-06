import { rollbackResponse } from '@/lib/pricing/effectHttp';

export async function POST(_request: Request, ctx: { params: Promise<{ changeId: string }> }) {
    const { changeId } = await ctx.params;
    return rollbackResponse(changeId);
}
