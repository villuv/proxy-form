import React, { Context, useContext, useEffect, useState } from 'react';
import { ContextValue, FormContext } from './context';
import { createProxy, getIn, mkDefault, setIn } from './helpers';
import { ChangeEvent, FieldHelpers, FieldPath, FormOptions } from './types';

export function useFormContext<TForm>(): ContextValue<TForm> {
  return useContext(FormContext as Context<ContextValue<TForm>>);
}

export interface UseFormReturn<TForm> {
  form: TForm;
  update: ContextValue<TForm>['update'];
  field: <TValue, TSource = TValue>(value: TValue, fieldOptions?: FieldOptions<TValue, TSource>) => FieldHelpers<TValue, TSource>;
}

export interface FieldOptions<TValue, TSource> extends FormOptions {
  transform?: (newValue: TSource, prevValue: TValue) => TValue;
};

export function useForm<TForm>(formOptions?: FormOptions): UseFormReturn<TForm> {
  const { register, getForm, update, trigger, defaultOptions } = useFormContext<TForm>();
  const [formState, setFormState] = useState<TForm>(getForm());

  formOptions = {...defaultOptions, ...formOptions};

  const accessedPaths: FieldPath[] = [];
  const proxyIdentifier = Symbol();
  const proxy = createProxy(proxyIdentifier, formState, [], (path) => {
    accessedPaths.push(path);
  });

  // TODO: optimize?
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    return register(accessedPaths, setFormState);
  });

  return {
    form: proxy as TForm,
    update,
    field<TValue, TSource = TValue>(value: TValue, fieldOptions?: FieldOptions<TValue, TSource>) {
      // Check if user is trying to access a proxy. If so, return the actual object.
      if(value && typeof value === 'object') {
        const proxyInfo = (value as any)[proxyIdentifier]; // This is a "special field" we have in our proxy implementation.
        if(proxyInfo) {
          value = proxyInfo[0];
          accessedPaths.push(proxyInfo[1]);
        }
      }

      // This implementation relies on the fact that the field will be accessed right before
      // this function is called.
      const fieldPath = accessedPaths[accessedPaths.length - 1];
      if(!fieldPath) {
        throw new Error('Incorrect form access. Are you mixing variables from nested useForm?');
      }

      const fieldValue = getIn(formState, fieldPath) as any;
      if(fieldValue !== value && !(isNaN(fieldValue) && isNaN(value as any))) {
        // Sanity check. User has used this function incorrectly if we can't get the same value out of the path.
        throw new Error('Incorrect field access.');
      }

      if(!mkDefault(true, fieldOptions?.controlled, formOptions?.controlled)) {
        // If this is not a controlled field, do not track this access.
        accessedPaths.pop();
      }

      const mode = mkDefault('onChange', fieldOptions?.mode, formOptions?.mode);
      return {
        name: fieldPath.join('.'),
        value: fieldValue as TValue,
        onChange: (eventOrValue: ChangeEvent | TSource) => {
          let newValue: any = eventOrValue;
          if(eventOrValue instanceof Object && eventOrValue.target) {
            const target = eventOrValue.target;

            if(target.type === 'checkbox') {
              newValue = target.checked;
            } else {
              newValue = target.value;
            }
          }

          if(fieldOptions?.transform) {
            newValue = fieldOptions.transform(newValue as TSource, fieldValue as TValue);
          }

          update(form => {
            setIn(form, fieldPath, newValue, () => ({}));
          }, { notify: mode === 'onChange' });
        },
        onBlur: () => {
          // TODO (check react-hook-form!)
          if(mode === 'onBlur') {
            trigger();
          }
        },
      };
    },
  };
}

export interface UseFormProps<TForm> extends FormOptions {
  render: (props: UseFormReturn<TForm>) => ReturnType<React.FC>;
}

export function UseForm<TForm>({ render, ...options }: UseFormProps<TForm>) {
  const props = useForm<TForm>(options);
  return render(props);
}