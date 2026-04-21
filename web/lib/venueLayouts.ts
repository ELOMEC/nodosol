import { getSupabaseClient } from "./supabase";
import { VenueRegion, VenueTemplate } from "./venue-templates";

export type VenueLayoutRegion = VenueRegion & {
  defaultColor?: string;
};

export type VenueLayoutDoc = {
  id: string;
  creatorPubkey: string;
  name: string;
  viewBox: string;
  stageD: string | null;
  stageLabel: string | null;
  backgroundUrl: string | null;
  regions: VenueLayoutRegion[];
  createdAt: string;
  updatedAt: string;
};

export type EventVenueMappingDoc = {
  eventPubkey: string;
  layoutId: string;
  creatorPubkey: string;
};

function rowToLayout(row: {
  id: string;
  creator_pubkey: string;
  name: string;
  view_box: string;
  stage_d: string | null;
  stage_label: string | null;
  background_url: string | null;
  regions: unknown;
  created_at: string;
  updated_at: string;
}): VenueLayoutDoc {
  return {
    id: row.id,
    creatorPubkey: row.creator_pubkey,
    name: row.name,
    viewBox: row.view_box,
    stageD: row.stage_d,
    stageLabel: row.stage_label,
    backgroundUrl: row.background_url,
    regions: Array.isArray(row.regions) ? (row.regions as VenueLayoutRegion[]) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listVenueLayoutsByCreator(
  creatorPubkey: string
): Promise<VenueLayoutDoc[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("venue_layouts")
    .select("*")
    .eq("creator_pubkey", creatorPubkey)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToLayout);
}

export async function getVenueLayout(id: string): Promise<VenueLayoutDoc | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("venue_layouts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToLayout(data) : null;
}

export async function saveVenueLayout(
  layout: Omit<VenueLayoutDoc, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<VenueLayoutDoc> {
  const supabase = getSupabaseClient();
  const payload = {
    creator_pubkey: layout.creatorPubkey,
    name: layout.name,
    view_box: layout.viewBox,
    stage_d: layout.stageD,
    stage_label: layout.stageLabel,
    background_url: layout.backgroundUrl,
    regions: layout.regions,
  };
  if (layout.id) {
    const { data, error } = await supabase
      .from("venue_layouts")
      .update(payload)
      .eq("id", layout.id)
      .select()
      .single();
    if (error) throw error;
    return rowToLayout(data);
  }
  const { data, error } = await supabase
    .from("venue_layouts")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return rowToLayout(data);
}

export async function deleteVenueLayout(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("venue_layouts").delete().eq("id", id);
  if (error) throw error;
}

export async function getEventVenueMapping(
  eventPubkey: string
): Promise<EventVenueMappingDoc | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("event_venue_mapping")
    .select("*")
    .eq("event_pubkey", eventPubkey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    eventPubkey: data.event_pubkey,
    layoutId: data.layout_id,
    creatorPubkey: data.creator_pubkey,
  };
}

export async function upsertEventVenueMapping(
  eventPubkey: string,
  layoutId: string,
  creatorPubkey: string
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("event_venue_mapping").upsert(
    {
      event_pubkey: eventPubkey,
      layout_id: layoutId,
      creator_pubkey: creatorPubkey,
    },
    { onConflict: "event_pubkey" }
  );
  if (error) throw error;
}

export async function deleteEventVenueMapping(eventPubkey: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("event_venue_mapping")
    .delete()
    .eq("event_pubkey", eventPubkey);
  if (error) throw error;
}

/** Adapt a stored layout to the VenueTemplate shape used by the SVG renderer. */
export function layoutToTemplate(layout: VenueLayoutDoc): VenueTemplate {
  return {
    id: `custom:${layout.id}`,
    name: layout.name,
    viewBox: layout.viewBox,
    stage: layout.stageD
      ? { d: layout.stageD, label: layout.stageLabel ?? "STAGE" }
      : undefined,
    regions: layout.regions,
  };
}
