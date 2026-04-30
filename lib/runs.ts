// Schedule ID minter. The Cloudflare deploy is stateless (Worker instances
// don't share memory across requests) so persistence happens in the client:
// /api/optimise returns the Schedule with scheduleId, distressScores live
// on each entry, and /api/execute receives autoPayCount + decisions[] in
// the request body. No fs / no Map needed.

export function newScheduleId(): string {
  return `SCH-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}
