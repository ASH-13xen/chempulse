/**
 * Marketplaces list sellers by town. For city comparisons we group towns into
 * the trading region a buyer would treat as "the same market".
 */
const REGION: Record<string, string> = {
  chennai: "Chennai", kanchipuram: "Chennai", kancheepuram: "Chennai", tiruvallur: "Chennai", thiruvallur: "Chennai",
  chengalpattu: "Chennai", ambattur: "Chennai", sriperumbudur: "Chennai", avadi: "Chennai", tambaram: "Chennai",
  ponneri: "Chennai", gummidipoondi: "Chennai", poonamallee: "Chennai", manali: "Chennai",
  mumbai: "Mumbai", "navi mumbai": "Mumbai", thane: "Mumbai", bhiwandi: "Mumbai", dombivli: "Mumbai", kalyan: "Mumbai",
  "vasai virar": "Mumbai", vasai: "Mumbai", virar: "Mumbai", palghar: "Mumbai", raigad: "Mumbai", panvel: "Mumbai",
  ambernath: "Mumbai", ambarnath: "Mumbai", "mira bhayandar": "Mumbai", ulhasnagar: "Mumbai", taloja: "Mumbai",
  boisar: "Mumbai", "kalyan dombivli": "Mumbai", "vasai-virar": "Mumbai", "mumbai suburban": "Mumbai",
  delhi: "Delhi NCR", "new delhi": "Delhi NCR", noida: "Delhi NCR", "greater noida": "Delhi NCR", gurugram: "Delhi NCR",
  gurgaon: "Delhi NCR", ghaziabad: "Delhi NCR", faridabad: "Delhi NCR", sonipat: "Delhi NCR", sonepat: "Delhi NCR",
  bahadurgarh: "Delhi NCR", "gautam buddha nagar": "Delhi NCR",
  ahmedabad: "Ahmedabad", gandhinagar: "Ahmedabad", vadodara: "Vadodara", baroda: "Vadodara", surat: "Surat",
  ankleshwar: "Bharuch–Ankleshwar", bharuch: "Bharuch–Ankleshwar", dahej: "Bharuch–Ankleshwar", vapi: "Vapi–Valsad",
  valsad: "Vapi–Valsad", rajkot: "Rajkot", kutch: "Kutch", bhavnagar: "Bhavnagar", anand: "Anand",
  kolkata: "Kolkata", howrah: "Kolkata", "north 24 parganas": "Kolkata", hyderabad: "Hyderabad", secunderabad: "Hyderabad",
  medak: "Hyderabad", sangareddy: "Hyderabad", "rangareddy": "Hyderabad", bengaluru: "Bengaluru", bangalore: "Bengaluru",
  "bengaluru rural": "Bengaluru", pune: "Pune", "pimpri chinchwad": "Pune", coimbatore: "Coimbatore", nagpur: "Nagpur",
  nashik: "Nashik", indore: "Indore", jaipur: "Jaipur", ludhiana: "Ludhiana", kanpur: "Kanpur", lucknow: "Lucknow",
  visakhapatnam: "Visakhapatnam", vizag: "Visakhapatnam", mohali: "Chandigarh", chandigarh: "Chandigarh",
};

/** The two markets the client watches most; always shown first. */
export const FOCUS_REGIONS = ["Chennai", "Mumbai"];

export function regionOf(city: string | null | undefined) {
  if (!city) return "Unknown";
  const key = city.trim().toLowerCase().replace(/\s+/g, " ");
  if (REGION[key]) return REGION[key];
  return city.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}
