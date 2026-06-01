'use client';

import React from 'react';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react';
import { type TopListItem } from '../api/types';

interface TopListProps {
  title: string;
  items: TopListItem[];
}

export function TopList({ title, items }: TopListProps) {
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl p-6">
      <h3 className="text-base font-semibold">{title}</h3>

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const isUp = item.trend === 'up';
          const Icon = isUp ? ArrowUpIcon : ArrowDownIcon;
          return (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{item.name}</span>
                <span className="text-muted-foreground text-xs">
                  {item.used} Used
                </span>
              </div>
              <div
                className={`flex size-8 items-center justify-center rounded-full ${
                  isUp ? 'bg-emerald-100' : 'bg-rose-100'
                }`}
              >
                <Icon
                  className={`size-4 ${
                    isUp ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
