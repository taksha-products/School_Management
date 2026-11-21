/** @type {import('next').NextConfig} */

const normalizeBackendUrl = (raw) => {
  const fallback = "http://localhost:5000";
  const value = (raw ?? fallback).trim();
  if (!value) return fallback;
  const cleaned = value.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
};

const getBackendUrl = () =>
  normalizeBackendUrl(process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL);

const nextConfig = {
  async rewrites() {
    const backendUrl = getBackendUrl();
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/logos/:path*", destination: `${backendUrl}/logos/:path*` }
    ];
  },
  async redirects() {
    return [
      { source: "/", destination: "/parent/login", permanent: false },
      { source: "/admin/buses", destination: "/admin/transport/buses", permanent: true },
      { source: "/admin/expenses", destination: "/admin/transport/expenses", permanent: true },
      { source: "/admin/fee-structure", destination: "/admin/fees/structure", permanent: true },
      { source: "/admin/school-fees", destination: "/admin/fees/outstanding", permanent: true },
      {
        source: "/admin/school-fees/outstanding",
        destination: "/admin/fees/outstanding",
        permanent: true
      },
      { source: "/admin/staff", destination: "/admin/settings/staff", permanent: true },
      { source: "/admin/parents", destination: "/admin/settings/parents", permanent: true },
      { source: "/admin/transport", destination: "/admin/transport/buses", permanent: false }
    ];
  }
};

export default nextConfig;
