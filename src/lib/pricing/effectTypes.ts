export type EffectScope = 'room' | 'cluster' | 'portfolio';

export type PriceMode = 'HIGH' | 'NORM' | 'LOW' | 'LASTMINUTE';

export type Confidence = 'high' | 'medium' | 'low';

export type EffectVerdict = 'confirmed' | 'neutral' | 'bad';

export type ChannelEventType =
    | 'channel_connect'
    | 'channel_close'
    | 'campaign_start'
    | 'calendar_event'
    | 'ota_closure';

export type MarketAnchor = {
    price_thb: number;
    confidence: Confidence;
    weight: number;
    source_count: number;
};

/** Frozen at publish time. Later reads must not rewrite it. */
export type PriceChangeSnapshot = {
    mode: PriceMode;
    rpi: number | null;
    structural_price: number | null;
    market_anchor: MarketAnchor | null;
    market_blended_price: number | null;
    final_price: number;
    pace_vs_norm_pct: number | null;
    guards_triggered: Array<{ guard: string; effect: string }>;
    elasticity_cluster: number | null;
    temperature: number | null;
    reason: string;
    complete: boolean;
};

export type OccupancyPoint = {
    days_before: number;
    occ_pct: number | null;
    occ_pct_yoy?: number | null;
};

export type PaceNormPoint = {
    days_before: number;
    norm_pct: number;
};

export type PricePoint = {
    days_before: number;
    price_thb: number | null;
    price_yoy?: number | null;
};

export type BookingsPoint = {
    days_before: number;
    nights_per_day: number;
    bookings_per_day: number;
    channel_breakdown?: Partial<Record<'direct' | 'airbnb' | 'booking' | 'agoda' | 'trip' | 'other', number>>;
};

export type CompBandPoint = {
    days_before: number;
    comp_median: number;
    comp_low: number;
    comp_high: number;
    snapshot_count: number;
};

export type PriceChangeMarker = {
    id: string;
    days_before: number;
    changed_at: string;
    price_before: number | null;
    price_after: number;
    initiator: string;
    user_name?: string;
    snapshot: PriceChangeSnapshot;
};

export type ExternalEvent = {
    id: string;
    days_before: number;
    event_type: ChannelEventType;
    description: string;
    event_at?: string;
};

export type EffectRow = {
    change_id: string;
    pace_before: number;
    pace_after: number;
    delta_pace: number;
    control_delta: number | null;
    above_control: number | null;
    control_group_size: number;
    adr_after: number | null;
    occupancy_forecast_delta: number | null;
    yoy_pace_delta: number | null;
    confidence: Confidence;
    verdict: EffectVerdict;
    alert: boolean;
    window_complete: boolean;
};

export type ChartMeta = {
    scope: EffectScope;
    scope_id: string;
    scope_label: string;
    period_code: string;
    date_from: string;
    date_to: string;
    horizon_days: number;
    effect_window: number;
    generated_at: string;
    compare_year: number | null;
    history_days: number;
    price_history: 'recorded' | 'current_only';
    control_threshold: number;
};

export type ChartPayload = {
    meta: ChartMeta;
    occupancy_series: OccupancyPoint[];
    pace_norm_series: PaceNormPoint[];
    price_series: PricePoint[];
    bookings_series: BookingsPoint[];
    comp_band: CompBandPoint[];
    price_changes: PriceChangeMarker[];
    external_events: ExternalEvent[];
    effect_table: EffectRow[];
};

export type RecommendationSummary = {
    scope: EffectScope;
    scope_id: string;
    period_from: string;
    period_to: string;
    total_changes: number;
    by_initiator: {
        engine: number;
        manager: number;
        override: number;
        rejected: number;
    };
    by_verdict: {
        confirmed: number;
        neutral: number;
        bad: number;
    };
    revpar_vs_control: {
        portfolio_revpar_thb: number | null;
        control_revpar_thb: number | null;
        delta_thb: number | null;
        delta_pct: number | null;
    };
};

export type EffectOptions = {
    clusters: Array<{ id: string; label: string }>;
    rooms: Array<{ id: string; label: string; cluster: string }>;
};

export type EffectBundle = {
    chart: ChartPayload;
    summary: RecommendationSummary;
    options: EffectOptions;
};
