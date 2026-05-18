import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = {
  translation: {
    nav: {
      home: 'Home',
      builds: 'Builds & Logs',
      hosts: 'SSH Hosts',
      settings: 'Settings',
      projects: 'Projects',
      pipelines: 'Pipelines',
      diskUsage: 'Disk usage',
      favorites: 'Favorites',
      recent: 'Recent',
    },
    actions: {
      addProject: 'Add project',
      removeProject: 'Remove project',
      deletePipeline: 'Delete pipeline',
      newPipeline: 'New pipeline',
      runPipeline: 'Run pipeline',
      cancelBuild: 'Cancel build',
      toggleTheme: 'Toggle theme',
      openPalette: 'Open command palette',
      help: 'Keyboard shortcuts',
      save: 'Save',
      cancel: 'Cancel',
      confirm: 'Confirm',
      close: 'Close',
    },
    palette: {
      placeholder: 'Type a command or search...',
      empty: 'No results.',
      sectionProjects: 'Projects',
      sectionPipelines: 'Pipelines',
      sectionBuilds: 'Builds',
      sectionActions: 'Actions',
      sectionRecent: 'Recent',
    },
    shortcuts: {
      title: 'Keyboard shortcuts',
      navigation: 'Navigation',
      goHome: 'Go to home',
      goProjects: 'Go to projects',
      goBuilds: 'Go to builds',
      goSettings: 'Go to settings',
      newPipeline: 'New pipeline (in current project)',
      focusSearch: 'Focus search',
      closeDialog: 'Close dialog / panel',
      openPalette: 'Open command palette',
      help: 'Show this help',
    },
    theme: {
      system: 'System',
      dark: 'Dark',
      light: 'Light',
      title: 'Theme',
    },
    density: {
      title: 'Density',
      comfortable: 'Comfortable',
      compact: 'Compact',
    },
    language: {
      title: 'Language',
    },
    breadcrumbs: {
      home: 'Home',
      projects: 'Projects',
      pipelines: 'Pipelines',
      builds: 'Builds',
      settings: 'Settings',
      diskUsage: 'Disk usage',
      project: 'Project',
      pipeline: 'Pipeline',
      build: 'Build',
    },
    toast: {
      saved: 'Saved.',
      copied: 'Copied to clipboard.',
      newCommit: 'New commit',
    },
  },
};

const tr = {
  translation: {
    nav: {
      home: 'Ana sayfa',
      builds: 'Yapılar ve Günlükler',
      hosts: 'SSH Sunucuları',
      settings: 'Ayarlar',
      projects: 'Projeler',
      pipelines: 'Pipeline\'lar',
      diskUsage: 'Disk kullanımı',
      favorites: 'Favoriler',
      recent: 'Son kullanılanlar',
    },
    actions: {
      addProject: 'Proje ekle',
      removeProject: 'Projeyi kaldır',
      deletePipeline: 'Pipeline\'ı sil',
      newPipeline: 'Yeni pipeline',
      runPipeline: 'Pipeline\'ı çalıştır',
      cancelBuild: 'Yapıyı iptal et',
      toggleTheme: 'Temayı değiştir',
      openPalette: 'Komut paletini aç',
      help: 'Klavye kısayolları',
      save: 'Kaydet',
      cancel: 'İptal',
      confirm: 'Onayla',
      close: 'Kapat',
    },
    palette: {
      placeholder: 'Komut yazın veya arayın...',
      empty: 'Sonuç yok.',
      sectionProjects: 'Projeler',
      sectionPipelines: 'Pipeline\'lar',
      sectionBuilds: 'Yapılar',
      sectionActions: 'Eylemler',
      sectionRecent: 'Son kullanılanlar',
    },
    shortcuts: {
      title: 'Klavye kısayolları',
      navigation: 'Gezinme',
      goHome: 'Ana sayfaya git',
      goProjects: 'Projelere git',
      goBuilds: 'Yapılara git',
      goSettings: 'Ayarlara git',
      newPipeline: 'Yeni pipeline (mevcut projede)',
      focusSearch: 'Aramaya odaklan',
      closeDialog: 'Diyaloğu kapat',
      openPalette: 'Komut paletini aç',
      help: 'Bu yardımı göster',
    },
    theme: {
      system: 'Sistem',
      dark: 'Koyu',
      light: 'Açık',
      title: 'Tema',
    },
    density: {
      title: 'Yoğunluk',
      comfortable: 'Rahat',
      compact: 'Sıkışık',
    },
    language: {
      title: 'Dil',
    },
    breadcrumbs: {
      home: 'Ana sayfa',
      projects: 'Projeler',
      pipelines: 'Pipeline\'lar',
      builds: 'Yapılar',
      settings: 'Ayarlar',
      diskUsage: 'Disk kullanımı',
      project: 'Proje',
      pipeline: 'Pipeline',
      build: 'Yapı',
    },
    toast: {
      saved: 'Kaydedildi.',
      copied: 'Panoya kopyalandı.',
      newCommit: 'Yeni commit',
    },
  },
};

const stored = (() => {
  try {
    const raw = localStorage.getItem('buildpilot.lang');
    if (raw === 'en' || raw === 'tr') return raw;
  } catch {
    // ignore
  }
  return 'en';
})();

void i18n.use(initReactI18next).init({
  resources: { en, tr },
  lng: stored,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
