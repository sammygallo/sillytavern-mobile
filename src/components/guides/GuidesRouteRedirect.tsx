import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGuidesPanelStore } from '../../stores/guidesPanelStore';

/**
 * Renders nothing visible. When mounted because the user landed on
 * /guides or /guides/:slug, opens the GuidesPanel to that guide and
 * replaces the URL with `/` so the chat canvas stays present underneath.
 */
export function GuidesRouteRedirect() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  // Guard against React StrictMode's double-invoked effect: the second run
  // would read window.location.hash AFTER the first run already navigated
  // away, losing the section anchor.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const sectionId =
      typeof window !== 'undefined' && window.location.hash
        ? window.location.hash.slice(1)
        : undefined;
    useGuidesPanelStore.getState().open(slug, sectionId);
    navigate('/', { replace: true });
  }, [slug, navigate]);

  return null;
}
