import { Printer, ArrowRight } from 'lucide-react';

interface ConfirmPrintButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export default function ConfirmPrintButton({
  disabled,
  onClick,
}: ConfirmPrintButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full px-8 py-4 rounded-[19.28px] text-[#ffff] border-2 border-white/60  bg-blue-100/34 hover:border-white/80 font-bold text-[22px] flex items-center justify-center gap-4 disabled:cursor-not-allowed"
    >
      {/* Label sengaja pendek + `whitespace-nowrap`: "Konfirmasi Cetak" pecah
          jadi dua baris di lebar tombol ini. Ikon printer & panah sudah
          menjelaskan aksinya, jadi teksnya cukup singkat. `shrink-0` di ikon
          supaya keduanya tidak gepeng saat ruang menyempit. */}
      <Printer className="w-6 h-6 shrink-0" />
      <span className="whitespace-nowrap">Cetak Sekarang</span>
      <ArrowRight className="w-6 h-6 shrink-0" />
    </button>
  );
}
