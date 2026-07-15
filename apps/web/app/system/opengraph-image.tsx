import { renderOg, OG_SIZE, OG_CONTENT_TYPE } from "../og/og-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "gipc.dev — live telemetry";

export default function Image() {
  return renderOg("The System", "live telemetry");
}
