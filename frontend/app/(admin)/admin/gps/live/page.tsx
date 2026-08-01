"use client";

import dynamic from "next/dynamic";

const LiveMapClient = dynamic(() => import("@/components/gps/LiveMapClient").then((m) => m.LiveMapClient), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
      Loading map...
    </div>
  )
});

const LiveGpsPage = (): JSX.Element => (
  <div className="flex h-full flex-col gap-4 p-4">
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold text-slate-900">Live Bus Tracking</h1>
    </div>
    <LiveMapClient />
  </div>
);

export default LiveGpsPage;
