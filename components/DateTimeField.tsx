import { useState, createElement } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'

export function formatDateTime(date: Date): string {
  return date.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// "2026-10-30T21:00" in the device's local time, the format <input type="datetime-local"> uses.
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// An hour from now, on the quarter hour: a sensible first guess for "later".
function defaultLater(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return d
}

// One date + time field that works on iOS (spinner with Done), Android (date,
// then time) and the web (the browser's own picker; the native module has no
// web build). Same picker behavior as the promotion and event forms.
export default function DateTimeField({ value, onChange, placeholder = 'Tap to pick a time' }: {
  value: Date | null
  onChange: (date: Date) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [iosPending, setIosPending] = useState<Date>(new Date())
  const [androidStep, setAndroidStep] = useState<'date' | 'time'>('date')
  const [androidPending, setAndroidPending] = useState<Date>(new Date())

  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'datetime-local',
      value: value ? toLocalInput(value) : '',
      min: toLocalInput(new Date()),
      onChange: (e: { target: { value: string } }) => {
        const d = new Date(e.target.value) // no offset in the string = local time
        if (!Number.isNaN(d.getTime())) onChange(d)
      },
      style: webInputStyle,
    })
  }

  const start = () => {
    const base = value ?? defaultLater()
    setIosPending(base)
    setAndroidPending(base)
    setAndroidStep('date')
    setOpen(true)
  }

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type !== 'set' || !selected) { setOpen(false); setAndroidStep('date'); return }
      if (androidStep === 'date') {
        setAndroidPending(selected)
        setAndroidStep('time')
      } else {
        const combined = new Date(androidPending)
        combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0)
        onChange(combined)
        setOpen(false)
        setAndroidStep('date')
      }
    } else if (selected) {
      setIosPending(selected)
    }
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.field} onPress={start}>
        <Text style={styles.fieldText}>{value ? formatDateTime(value) : placeholder}</Text>
      </TouchableOpacity>
      {open && (Platform.OS === 'ios' ? (
        <View style={styles.iosWrap}>
          <View style={styles.iosHeader}>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Text style={styles.iosCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { onChange(iosPending); setOpen(false) }}>
              <Text style={styles.iosDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={iosPending}
            mode="datetime"
            display="spinner"
            onChange={onPickerChange}
            minimumDate={new Date()}
            textColor="#f8fafc"
            themeVariant="dark"
          />
        </View>
      ) : (
        <DateTimePicker
          value={androidPending}
          mode={androidStep}
          display="default"
          onChange={onPickerChange}
          minimumDate={new Date()}
        />
      ))}
    </View>
  )
}

const webInputStyle = {
  backgroundColor: '#0D1B2E', color: '#29B6F6', colorScheme: 'dark',
  border: '1px solid #1A2E4A', borderRadius: 10, padding: 12, fontSize: 14,
  fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}

const styles = StyleSheet.create({
  wrap:  { gap: 8 },
  field: {
    backgroundColor: '#0D1B2E', borderRadius: 10, minHeight: 44,
    padding: 12, borderWidth: 1, borderColor: '#1A2E4A', justifyContent: 'center',
  },
  fieldText: { fontSize: 14, color: '#29B6F6' },
  iosWrap: {
    backgroundColor: '#0D1B2E', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2E4A', overflow: 'hidden',
  },
  iosHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1A2E4A',
  },
  iosCancel: { fontSize: 14, color: '#7A93AC' },
  iosDone:   { fontSize: 14, fontWeight: '700', color: '#29B6F6' },
})
