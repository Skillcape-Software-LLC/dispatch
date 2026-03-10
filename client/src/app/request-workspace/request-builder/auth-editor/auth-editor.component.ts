import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActiveRequestAuth } from '../../../core/models/active-request.model';

@Component({
  selector: 'app-auth-editor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './auth-editor.component.html',
  styleUrl: './auth-editor.component.scss',
})
export class AuthEditorComponent {
  auth = input.required<ActiveRequestAuth>();
  authChange = output<ActiveRequestAuth>();

  setType(type: ActiveRequestAuth['type']): void {
    this.authChange.emit({ ...this.auth(), type });
  }

  setBearerToken(token: string): void {
    this.authChange.emit({ ...this.auth(), bearer: { token } });
  }

  setBasicUsername(username: string): void {
    this.authChange.emit({ ...this.auth(), basic: { ...this.auth().basic, username } });
  }

  setBasicPassword(password: string): void {
    this.authChange.emit({ ...this.auth(), basic: { ...this.auth().basic, password } });
  }

  setApiKey(key: string): void {
    this.authChange.emit({ ...this.auth(), apikey: { ...this.auth().apikey, key } });
  }

  setApiValue(value: string): void {
    this.authChange.emit({ ...this.auth(), apikey: { ...this.auth().apikey, value } });
  }

  setApiIn(location: 'header' | 'query'): void {
    this.authChange.emit({ ...this.auth(), apikey: { ...this.auth().apikey, in: location } });
  }
}
