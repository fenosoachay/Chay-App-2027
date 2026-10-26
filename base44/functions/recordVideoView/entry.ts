import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const videoId = body.video_id;
    if (typeof videoId !== 'string' || !videoId) {
      return Response.json({ error: 'video_id required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const video = await svc.entities.Video.get(videoId).catch(() => null);
    if (!video) {
      return Response.json({ error: 'Video not found' }, { status: 404 });
    }

    const viewedBy = Array.isArray(video.viewed_by) ? video.viewed_by : [];
    const currentCount = Math.max(0, Math.floor(Number(video.view_count) || 0));

    // Vérifier si l'utilisateur a déjà comptabilisé une vue
    if (viewedBy.includes(user.id)) {
      return Response.json({ view_count: currentCount, already_viewed: true });
    }

    // Incrémenter le compteur et ajouter l'utilisateur
    const newCount = currentCount + 1;
    const newViewedBy = [...viewedBy, user.id];

    await svc.entities.Video.update(videoId, {
      view_count: newCount,
      viewed_by: newViewedBy,
    });

    return Response.json({ view_count: newCount });
  } catch (error) {
    console.error('[recordVideoView] Could not record view.', error);
    return Response.json({ error: 'Could not record view' }, { status: 500 });
  }
}