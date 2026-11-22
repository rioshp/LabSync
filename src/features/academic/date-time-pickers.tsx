import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandColors } from '@/constants/theme';

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];
const WEEKDAYS = ['Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb', 'Mg'];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

function formatYmd(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function displayDate(ymd: string) {
  const parsed = parseYmd(ymd);
  if (!parsed) return '';
  return `${parsed.day} ${MONTHS_SHORT[parsed.month]} ${parsed.year}`;
}

export function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (ymd: string) => void;
}) {
  const now = new Date();
  const initial = parseYmd(value) ?? {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
  };
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  function shiftMonth(delta: number) {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewYear(nextYear);
    setViewMonth(nextMonth);
  }

  const firstDayJs = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun..6=Sat
  const offset = (firstDayJs + 6) % 7; // Monday-first: 0=Mon..6=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selected = parseYmd(value);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          if (!open) {
            const target = parseYmd(value);
            if (target) {
              setViewYear(target.year);
              setViewMonth(target.month);
            }
          }
          setOpen((prev) => !prev);
        }}
        style={[styles.trigger, open && styles.triggerActive]}
      >
        <SymbolView
          name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
          size={16}
          tintColor={value ? BrandColors.ink : BrandColors.muted}
        />
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {value ? displayDate(value) : 'Pilih tanggal'}
        </Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bulan sebelumnya"
              onPress={() => shiftMonth(-1)}
              style={styles.monthNav}
            >
              <Text style={styles.monthNavText}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bulan berikutnya"
              onPress={() => shiftMonth(1)}
              style={styles.monthNav}
            >
              <Text style={styles.monthNavText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {cells.map((day, idx) => {
              if (!day) return <View key={`empty-${idx}`} style={styles.dayCell} />;
              const isSelected =
                selected?.year === viewYear &&
                selected?.month === viewMonth &&
                selected?.day === day;
              return (
                <Pressable
                  key={`d-${day}`}
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(formatYmd(viewYear, viewMonth, day));
                    setOpen(false);
                  }}
                  style={styles.dayCell}
                >
                  <View style={[styles.dayBadge, isSelected && styles.dayBadgeSelected]}>
                    <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function TimePickerField({
  label,
  value,
  open,
  onToggle,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onToggle}
        style={[styles.trigger, open && styles.triggerActive]}
      >
        <SymbolView
          name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
          size={16}
          tintColor={value ? BrandColors.ink : BrandColors.muted}
        />
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {value || 'Pilih jam'}
        </Text>
      </Pressable>
    </View>
  );
}

export function TimePickerPanel({
  title,
  value,
  onChange,
  onDone,
}: {
  title: string;
  value: string;
  onChange: (hhmm: string) => void;
  onDone: () => void;
}) {
  const [selectedHour = '08', selectedMinute = '00'] = value.includes(':')
    ? value.split(':')
    : ['08', '00'];

  return (
    <View style={styles.panel}>
      <View style={styles.timePanelHeader}>
        <Text style={styles.monthTitle}>{title}</Text>
        <Pressable accessibilityRole="button" onPress={onDone} style={styles.donePill}>
          <Text style={styles.donePillText}>Selesai</Text>
        </Pressable>
      </View>
      <View style={styles.timeColumns}>
        <View style={styles.timeCol}>
          <Text style={styles.timeColLabel}>Jam</Text>
          <ScrollView style={styles.timeScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <View style={styles.chipGrid}>
              {HOURS.map((h) => {
                const active = h === selectedHour;
                return (
                  <Pressable
                    key={h}
                    accessibilityRole="button"
                    onPress={() => onChange(`${h}:${selectedMinute}`)}
                    style={[styles.timeChip, active && styles.timeChipActive]}
                  >
                    <Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>
                      {h}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
        <View style={styles.timeDivider} />
        <View style={styles.timeCol}>
          <Text style={styles.timeColLabel}>Menit</Text>
          <ScrollView style={styles.timeScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <View style={styles.chipGrid}>
              {MINUTES.map((m) => {
                const active = m === selectedMinute;
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    onPress={() => onChange(`${selectedHour}:${m}`)}
                    style={[styles.timeChip, active && styles.timeChipActive]}
                  >
                    <Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    color: BrandColors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  trigger: {
    minHeight: 46,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BrandColors.inputBorder,
    backgroundColor: BrandColors.paper,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  triggerActive: {
    borderColor: BrandColors.ink,
  },
  triggerText: {
    color: BrandColors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  placeholder: {
    color: BrandColors.muted,
    fontWeight: '400',
  },
  panel: {
    backgroundColor: BrandColors.pageBackground,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 12,
    gap: 10,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNav: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BrandColors.paper,
    borderWidth: 1,
    borderColor: BrandColors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavText: {
    color: BrandColors.ink,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  monthTitle: {
    color: BrandColors.ink,
    fontSize: 13.5,
    fontWeight: '800',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: BrandColors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  dayBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeSelected: {
    backgroundColor: BrandColors.ink,
  },
  dayText: {
    color: BrandColors.ink,
    fontSize: 12.5,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: BrandColors.paper,
    fontWeight: '800',
  },
  timePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  donePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: BrandColors.ink,
  },
  donePillText: {
    color: BrandColors.paper,
    fontSize: 11.5,
    fontWeight: '800',
  },
  timeColumns: {
    flexDirection: 'row',
    gap: 10,
  },
  timeCol: {
    flex: 1,
    gap: 6,
  },
  timeColLabel: {
    color: BrandColors.muted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  timeScroll: {
    maxHeight: 148,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  timeChip: {
    width: 40,
    height: 34,
    borderRadius: 10,
    backgroundColor: BrandColors.paper,
    borderWidth: 1,
    borderColor: BrandColors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipActive: {
    backgroundColor: BrandColors.ink,
    borderColor: BrandColors.ink,
  },
  timeChipText: {
    color: BrandColors.ink,
    fontSize: 12.5,
    fontWeight: '700',
  },
  timeChipTextActive: {
    color: BrandColors.paper,
    fontWeight: '800',
  },
  timeDivider: {
    width: 1,
    backgroundColor: BrandColors.line,
  },
});
