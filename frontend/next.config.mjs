/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:5000";
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
  async redirects() {
    return [
      { source: "/admin/buses", destination: "/admin/transport/buses", permanent: true },
      { source: "/admin/expenses", destination: "/admin/transport/expenses", permanent: true },
      { source: "/admin/fee-structure", destination: "/admin/fees/structure", permanent: true },
      { source: "/admin/school-fees", destination: "/admin/fees", permanent: true },
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
