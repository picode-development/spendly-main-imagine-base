// ₹12,34,567 — Indian digit grouping, no decimals (widget shows whole rupees)
export const formatINR = (value: number) => {
    const sign = value < 0 ? "-" : "";
    const digits = Math.round(Math.abs(value)).toString();
    if (digits.length <= 3) return `${sign}₹${digits}`;
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    return `${sign}₹${rest},${last3}`;
};

export const formatTime = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours() % 12 || 12;
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m} ${d.getHours() >= 12 ? "pm" : "am"}`;
};
