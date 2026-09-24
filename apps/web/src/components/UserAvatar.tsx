import { useState } from 'react';
import { initialsFor, profilePhotoUrl } from '../lib/avatar';

interface UserAvatarProps {
  name?: string | null;
  /** Used for initials when there is no name, and as the image's alt text. */
  email?: string | null;
  photo?: string | null;
  /** Rendered size in pixels. One number, so the circle can never go oval. */
  size?: number;
  /**
   * Fill the parent box instead of taking `size` as the actual width and
   * height. `size` is then only a hint for how large the initials should be.
   *
   * This exists because the inline width/height below beat any `h-full w-full`
   * a caller passes in `className` — an inline style always wins over a class —
   * so a 64px avatar inside the workspace page's 40px button was drawn at 64px
   * and clipped by the button's `overflow-hidden`, showing the middle of the
   * face and spilling off the right edge of the screen.
   */
  fill?: boolean;
  className?: string;
  /** A hairline ring, for an avatar sitting on a busy surface. */
  ring?: boolean;
}

/**
 * The signed-in person, as a circle.
 *
 * Every page header had its own copy of this — a gradient disc with the first
 * letter of the name, and an `<img>` that was never reached because
 * `ga_user.profilePhoto` did not exist until the user uploaded one in that
 * same browser. The photo now arrives with the login payload (see
 * `src/routes/auth.ts`), and the fallback here is what happens when it is
 * genuinely absent or the object has since been deleted, rather than the
 * permanent state of affairs.
 */
export default function UserAvatar({
  name,
  email,
  photo,
  size = 32,
  fill = false,
  className = '',
  ring = false,
}: UserAvatarProps) {
  const src = profilePhotoUrl(photo);
  // Remember *which* url failed rather than a bare flag: a new photo then gets
  // a fresh attempt on its own, with no effect resetting state after a render.
  const [failed, setFailed] = useState<string | null>(null);
  const broken = !!src && failed === src;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-primary to-accent font-bold text-onScrim ${
        ring ? 'ring-1 ring-border' : ''
      } ${fill ? 'h-full w-full' : ''} ${className}`}
      style={
        fill
          ? { fontSize: Math.max(10, Math.round(size * 0.38)) }
          : { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }
      }
      aria-hidden={false}
    >
      {src && !broken ? (
        <img
          src={src}
          alt={name || email || 'Profile photo'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="select-none leading-none">{initialsFor(name, email)}</span>
      )}
    </span>
  );
}
