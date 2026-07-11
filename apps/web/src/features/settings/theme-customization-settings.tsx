import {
  AnticlockwiseLine as RotateCcwIcon,
  CopyLine as CopyIcon,
  UploadLine as UploadIcon,
} from '@mingcute/react'
import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '~/components/ui/button'
import { ColorPalette } from '~/components/ui/color-palette'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Slider } from '~/components/ui/slider'
import { Switch } from '~/components/ui/switch'
import type { ThemeOverrides, ThemeVariant } from '~/store/theme-customization'
import {
  parseThemeImport,
  resolveThemePreview,
  selectActiveThemeProfile,
  useThemeCustomizationStore,
} from '~/store/theme-customization'

import { SettingsGroup } from './settings-container'

export const ThemeCustomizationSettings = () => {
  const { t } = useTranslation('settings')
  const importProfile = useThemeCustomizationStore(state => state.importProfile)
  const [importError, setImportError] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const importTheme = async (file: File | undefined): Promise<void> => {
    if (!file) {
      return
    }
    try {
      const profile = parseThemeImport(await file.text())
      importProfile(profile)
      setImportError(false)
    }
    catch {
      setImportError(true)
    }
    finally {
      if (importInputRef.current) {
        importInputRef.current.value = ''
      }
    }
  }

  return (
    <SettingsGroup
      label={t('appearance.customization.title')}
      description={t('appearance.customization.description')}
      action={(
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={event => void importTheme(event.currentTarget.files?.[0])}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            data-testid="appearance-theme-import"
            onClick={() => importInputRef.current?.click()}
          >
            <UploadIcon data-icon="inline-start" />
            {t('appearance.customization.import')}
          </Button>
        </div>
      )}
      bare
    >
      {/* Two-column editors - no tab, both visible and editable */}
      {importError && (
        <p role="alert" className="px-4 pt-4 text-xs text-destructive text-pretty">
          {t('appearance.customization.importError')}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="border-b border-border/60 sm:border-b-0 sm:border-r">
          <ThemeProfileEditor variant="light" />
        </div>
        <ThemeProfileEditor variant="dark" />
      </div>
    </SettingsGroup>
  )
}

const ThemeProfileEditor = ({ variant }: { variant: ThemeVariant }) => {
  const { t } = useTranslation('settings')
  const profiles = useThemeCustomizationStore(state => state.profiles)
  const activeProfileIds = useThemeCustomizationStore(state => state.activeProfileIds)
  const setActiveProfile = useThemeCustomizationStore(state => state.setActiveProfile)
  const updateProfile = useThemeCustomizationStore(state => state.updateProfile)
  const updateOverrides = useThemeCustomizationStore(state => state.updateOverrides)
  const resetOverrides = useThemeCustomizationStore(state => state.resetOverrides)
  const duplicateProfile = useThemeCustomizationStore(state => state.duplicateProfile)

  const activeProfile = selectActiveThemeProfile({ profiles, activeProfileIds }, variant)
  const variantProfiles = profiles.filter(profile => profile.variant === variant)
  const preview = resolveThemePreview(activeProfile)
  const overrides = activeProfile.overrides
  const hasOverrides = (Object.values(overrides) as Array<unknown>).some(value => value !== null)

  const changeOverride = <Key extends keyof ThemeOverrides>(
    key: Key,
    value: ThemeOverrides[Key],
  ): void => {
    updateOverrides(activeProfile.id, { [key]: value })
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-xs font-semibold text-foreground">{t(`appearance.theme.${variant}`)}</h3>
          {variantProfiles.length > 1 && (
            <Select value={activeProfile.id} onValueChange={id => setActiveProfile(variant, id)}>
              <SelectTrigger
                size="sm"
                className="h-7 min-w-0 max-w-44 text-xs"
                data-testid={`appearance-theme-profile-select-${variant}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variantProfiles.map(profile => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          data-testid={`appearance-theme-duplicate-${variant}`}
          aria-label={t('appearance.customization.duplicateProfile')}
          onClick={() => duplicateProfile(activeProfile.id)}
        >
          <CopyIcon data-icon="inline-start" />
          {t('appearance.customization.duplicate')}
        </Button>
      </div>

      <FieldRow label={t('appearance.customization.name')}>
        <Input
          value={activeProfile.name}
          aria-label={t('appearance.customization.name')}
          data-testid={`appearance-theme-name-${variant}`}
          onChange={event => updateProfile(activeProfile.id, { name: event.currentTarget.value })}
          className="h-8 w-full max-w-48 text-xs"
        />
      </FieldRow>

      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          {t('appearance.customization.colors')}
        </span>
        <ThemeColorField
          label={t('appearance.customization.accent')}
          value={preview.accentColor}
          overridden={overrides.accentColor !== null}
          testid={`appearance-theme-accent-${variant}`}
          onChange={value => changeOverride('accentColor', value)}
          onReset={() => changeOverride('accentColor', null)}
        />
        <ThemeColorField
          label={t('appearance.customization.background')}
          value={preview.backgroundColor}
          overridden={overrides.backgroundColor !== null}
          testid={`appearance-theme-background-${variant}`}
          onChange={value => changeOverride('backgroundColor', value)}
          onReset={() => changeOverride('backgroundColor', null)}
        />
        <ThemeColorField
          label={t('appearance.customization.foreground')}
          value={preview.foregroundColor}
          overridden={overrides.foregroundColor !== null}
          testid={`appearance-theme-foreground-${variant}`}
          onChange={value => changeOverride('foregroundColor', value)}
          onReset={() => changeOverride('foregroundColor', null)}
        />
      </div>

      <FieldRow
        label={t('appearance.customization.uiFont')}
        reset={{ overridden: overrides.uiFont !== null, onReset: () => changeOverride('uiFont', null) }}
      >
        <Input
          value={overrides.uiFont ?? ''}
          placeholder={preview.uiFont}
          aria-label={t('appearance.customization.uiFont')}
          data-testid={`appearance-theme-ui-font-${variant}`}
          onChange={event => changeOverride('uiFont', event.currentTarget.value.trimStart() || null)}
          className="h-8 w-full max-w-56 font-mono text-xs"
        />
      </FieldRow>

      <FieldRow
        label={t('appearance.customization.codeFont')}
        reset={{ overridden: overrides.codeFont !== null, onReset: () => changeOverride('codeFont', null) }}
      >
        <Input
          value={overrides.codeFont ?? ''}
          placeholder={preview.codeFont}
          aria-label={t('appearance.customization.codeFont')}
          data-testid={`appearance-theme-code-font-${variant}`}
          onChange={event => changeOverride('codeFont', event.currentTarget.value.trimStart() || null)}
          className="h-8 w-full max-w-56 font-mono text-xs"
        />
      </FieldRow>

      <FieldRow
        label={t('appearance.customization.translucentSidebar')}
        description={t('appearance.customization.translucentSidebarDescription')}
        reset={{ overridden: overrides.translucentSidebar !== null, onReset: () => changeOverride('translucentSidebar', null) }}
      >
        <Switch
          checked={preview.translucentSidebar}
          onCheckedChange={value => changeOverride('translucentSidebar', value)}
          aria-label={t('appearance.customization.translucentSidebar')}
          data-testid={`appearance-theme-translucent-sidebar-${variant}`}
        />
      </FieldRow>

      <FieldRow
        label={t('appearance.customization.contrast')}
        description={t('appearance.customization.contrastDescription')}
        reset={{ overridden: overrides.contrast !== null, onReset: () => changeOverride('contrast', null) }}
      >
        <div className="flex w-44 items-center gap-2">
          <Slider
            value={[preview.contrast]}
            min={0}
            max={100}
            step={1}
            onValueChange={value => changeOverride('contrast', value[0] ?? 50)}
            aria-label={t('appearance.customization.contrast')}
            data-testid={`appearance-theme-contrast-${variant}`}
          />
          <span className="w-7 text-right text-xs tabular-nums text-muted-foreground">
            {preview.contrast}
          </span>
        </div>
      </FieldRow>

      <Button
        variant="destructive"
        size="sm"
        className="mt-1 w-fit"
        disabled={!hasOverrides}
        data-testid={`appearance-theme-reset-${variant}`}
        onClick={() => resetOverrides(activeProfile.id)}
      >
        <RotateCcwIcon data-icon="inline-start" />
        {t('appearance.customization.resetProfile')}
      </Button>
    </div>
  )
}

interface FieldRowProps {
  label: string
  description?: string
  reset?: { overridden: boolean, onReset: () => void }
  children: ReactNode
}

const FieldRow = ({ label, description, reset, children }: FieldRowProps) => {
  const { t } = useTranslation('settings')
  return (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <div className="text-[13px] font-medium text-foreground">{label}</div>
      {description && (
        <p className="mt-0.5 text-[12px] text-muted-foreground text-pretty">{description}</p>
      )}
    </div>
    <div className="flex min-w-0 items-center gap-1.5">
      {children}
      {reset && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7 text-muted-foreground hover:text-foreground"
          disabled={!reset.overridden}
          onClick={reset.onReset}
          aria-label={t('appearance.customization.resetField')}
        >
          <RotateCcwIcon className="size-3.5" />
        </Button>
      )}
    </div>
  </div>
  )
}

const ThemeColorField = ({
  label,
  value,
  overridden,
  onChange,
  onReset,
  testid,
}: {
  label: string
  value: string
  overridden: boolean
  onChange: (value: string) => void
  onReset: () => void
  testid?: string
}) => {
  const { t } = useTranslation('settings')
  return (
  <div className="flex items-center justify-between gap-2 py-0.5">
    <div className="flex min-w-0 items-center gap-2">
      <ColorPalette value={value} label={label} onChange={onChange} disableAlpha />
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-foreground">{label}</div>
        <div className="truncate font-mono text-[10px] uppercase text-muted-foreground">{value}</div>
      </div>
    </div>
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-7 text-muted-foreground hover:text-foreground"
      disabled={!overridden}
      onClick={onReset}
      aria-label={t('appearance.customization.resetField')}
      data-testid={testid}
    >
      <RotateCcwIcon className="size-3.5" />
    </Button>
  </div>
  )
}
