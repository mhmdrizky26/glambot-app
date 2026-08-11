import { redirect } from 'next/navigation';

// Create Package dinonaktifkan: sistem dirancang untuk dua paket tetap
// ('regular' & 'vip') yang sudah ada dari seed, dan packages.code UNIQUE —
// jadi form ini tidak akan pernah berhasil submit. Alasan lengkapnya ada di
// komentar PackagePage.tsx. Route dibiarkan hidup (redirect, bukan dihapus)
// supaya bookmark/link lama tidak jatuh ke 404.
export default function PackageCreateRoute() {
  redirect('/packages');
}
