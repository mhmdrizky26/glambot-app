'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  PrinterIcon,
  ImageIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
} from 'lucide-react';
import { Progress } from '@/components/admin/ui/progress';

interface PrinterInfo {
  id: string;
  resolution: string;
  status: string;
  lastActive: string;
  activeDuration: string;
  totalPrint: number;
  isOnline: boolean;
  imageSrc?: string;
  paperRemaining: number;
  paperTotal: number;
  ribbonRemaining: number;
  paperSize: string;
  paperType: string;
  isReady: boolean;
}

interface PrinterCardProps {
  data: PrinterInfo;
}

export function PrinterCard({ data }: PrinterCardProps) {
  const paperPct = Math.round((data.paperRemaining / data.paperTotal) * 100);

  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PrinterIcon className="size-5 text-purple-500" />
          <span className="text-base font-semibold">Printer Photo</span>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            data.isOnline
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-rose-100 text-rose-700'
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              data.isOnline ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          {data.isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* 2-column body */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left column: image + information */}
        <div className="flex flex-col gap-4">
          <div className="bg-muted relative mx-auto flex aspect-square w-full max-w-[330px] items-center justify-center overflow-hidden rounded-lg border">
            {data.imageSrc ? (
              <Image
                src={data.imageSrc}
                alt="Printer"
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="size-10" />
                <span className="text-xs">No image</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <div className="text-base font-semibold">Information</div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">ID Printer</span>
              <span className="text-right font-medium">{data.id}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Resolution</span>
              <span className="text-right font-medium">{data.resolution}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Status</span>
              <span className="text-right font-medium">{data.status}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Last Active</span>
              <span className="text-right font-medium">{data.lastActive}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Active Duration</span>
              <span className="text-right font-medium">
                {data.activeDuration}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Print</span>
              <span className="text-right font-medium">{data.totalPrint}</span>
            </div>
          </div>
        </div>

        {/* Right column: stat cards */}
        <div className="flex flex-col gap-3">
          {/* Remaining Photo Paper */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-blue-500" />
                <span className="text-sm font-medium">
                  Remaining Photo Paper
                </span>
              </div>
              <span className="text-sm font-semibold">
                {data.paperRemaining}/{data.paperTotal}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {data.paperRemaining} sheets left
            </p>
            <Progress value={paperPct} className="mt-3 h-2" />
          </div>

          {/* Remaining Ribbon */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Remaining Ribbon</span>
              <span className="text-sm font-semibold">
                {data.ribbonRemaining}%
              </span>
            </div>
            <Progress value={data.ribbonRemaining} className="mt-3 h-2" />
          </div>

          {/* Paper info */}
          <div className="rounded-lg border p-4">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Paper Size</span>
                <span className="font-medium">{data.paperSize}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Paper Type</span>
                <span className="font-medium">{data.paperType}</span>
              </div>
            </div>
          </div>

          {/* Printer Status */}
          <div
            className={`flex items-center gap-3 rounded-lg border p-4 ${
              data.isReady
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div
              className={`flex size-9 items-center justify-center rounded-lg ${
                data.isReady ? 'bg-emerald-100' : 'bg-amber-100'
              }`}
            >
              {data.isReady ? (
                <CheckCircle2Icon className="size-5 text-emerald-600" />
              ) : (
                <AlertCircleIcon className="size-5 text-amber-600" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Printer Status</span>
              <span
                className={`text-xs ${
                  data.isReady ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {data.isReady ? 'Ready to print' : 'Needs attention'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { PrinterInfo };
