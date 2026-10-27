// E-ink friendly building blocks: black on white, thick borders, no animation or ripple.

import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View, type TextInputProps} from 'react-native';

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const {label, onPress, disabled, primary} = props;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[styles.button, primary && styles.buttonPrimary, disabled && styles.buttonDisabled]}>
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & {label: string}) {
  const {label, ...rest} = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        placeholderTextColor="#777"
        {...rest}
      />
    </View>
  );
}

export function Header(props: {title: string; children?: React.ReactNode}) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {props.title}
      </Text>
      <View style={styles.row}>{props.children}</View>
    </View>
  );
}

export function Message(props: {text: string | null; error?: boolean}) {
  if (!props.text) {
    return null;
  }
  return (
    <Text style={[styles.message, props.error && styles.messageError]}>{props.text}</Text>
  );
}

export const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#fff', padding: 24},
  row: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 3,
    borderColor: '#000',
    paddingBottom: 12,
    marginBottom: 16,
  },
  headerTitle: {fontSize: 34, fontWeight: '700', color: '#000', flexShrink: 1},
  button: {
    borderWidth: 3,
    borderColor: '#000',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    backgroundColor: '#fff',
    minWidth: 120,
    alignItems: 'center',
  },
  buttonPrimary: {backgroundColor: '#000'},
  buttonDisabled: {borderColor: '#999'},
  buttonText: {fontSize: 26, color: '#000'},
  buttonTextPrimary: {color: '#fff'},
  field: {marginBottom: 18},
  label: {fontSize: 24, color: '#000', marginBottom: 6},
  input: {
    borderWidth: 3,
    borderColor: '#000',
    borderRadius: 8,
    fontSize: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#000',
  },
  message: {fontSize: 24, color: '#000', marginVertical: 10},
  messageError: {fontWeight: '700'},
  listItem: {borderBottomWidth: 2, borderColor: '#000', paddingVertical: 16},
  itemTitle: {fontSize: 28, fontWeight: '600', color: '#000'},
  itemSub: {fontSize: 22, color: '#333', marginTop: 4},
  section: {fontSize: 28, fontWeight: '700', color: '#000', marginTop: 20, marginBottom: 8},
  choice: {marginBottom: 10},
  root: {flex: 1, backgroundColor: '#fff'},
  flex1: {flex: 1},
  list: {flex: 1, marginTop: 8},
  pager: {justifyContent: 'space-between', marginTop: 12},
  actions: {marginTop: 8},
  spacer: {height: 40},
});
